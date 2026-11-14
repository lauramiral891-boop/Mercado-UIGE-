import { describe, it, expect, beforeEach, vi } from "vitest";
import { SyncQueue, OfflineOrderRepo, OfflineMessageRepo } from "../offline";

// Mock localStorage in memory for tests
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
});

describe("SyncQueue & Offline-First Repository Suite", () => {
  beforeEach(() => {
    storageMock.clear();
    vi.restoreAllMocks();
  });

  it("1. Cria encomenda sem rede e regista na fila com clientMutationId", async () => {
    const queue = new SyncQueue("test_queue", "test_processed");
    const orderRepo = new OfflineOrderRepo();

    // Simula criação de encomenda offline
    const order = await orderRepo.create({
      userId: "user_uige_123",
      items: [{ productId: "prod_cafe_1", qty: 2 }],
      address: "Bairro Candombe Velho, Uíge",
      paymentMethod: "Multicaixa Express",
      deliveryFee: 1500,
    });

    expect(order.id).toBeDefined();
    expect(order.clientMutationId).toBeDefined();
    expect(order.status).toBe("Pendente");
    expect(order.total).toBe(1500); // 0 unit + 1500 delivery

    // Enfileira na fila de teste
    queue.enqueue("CREATE_ORDER", order, order.clientMutationId);
    const pending = queue.getQueue();
    expect(pending.length).toBe(1);
    expect(pending[0].type).toBe("CREATE_ORDER");
    expect(pending[0].clientMutationId).toBe(order.clientMutationId);
  });

  it("2. Cria mensagem sem rede e persiste na fila", async () => {
    const queue = new SyncQueue("test_queue", "test_processed");
    const messageRepo = new OfflineMessageRepo();

    const msg = await messageRepo.send({
      senderId: "buyer_456",
      receiverId: "seller_789",
      productId: "prod_cafe_1",
      content: "Tem café do Uíge fresco disponível para entrega hoje?",
    });

    expect(msg.id).toBeDefined();
    expect(msg.clientMutationId).toBeDefined();
    expect(msg.content).toContain("café do Uíge");

    queue.enqueue("SEND_MESSAGE", msg, msg.clientMutationId);
    const pending = queue.getQueue();
    expect(pending.length).toBe(1);
    expect(pending[0].type).toBe("SEND_MESSAGE");
  });

  it("3. Reabrir a app mantém o estado da fila intacto", () => {
    const queue1 = new SyncQueue("test_queue", "test_processed");
    queue1.enqueue("CREATE_ORDER", { test: "data" }, "mutation_xyz_1");
    expect(queue1.getQueue().length).toBe(1);

    // Simula encerramento e nova instância da app
    const queue2 = new SyncQueue("test_queue", "test_processed");
    const loaded = queue2.getQueue();
    expect(loaded.length).toBe(1);
    expect(loaded[0].clientMutationId).toBe("mutation_xyz_1");
  });

  it("4. Voltar a rede sincroniza as acções pendentes com o servidor", async () => {
    const queue = new SyncQueue("test_queue", "test_processed");
    const mutationId = "mutation_order_success";

    queue.enqueue("CREATE_ORDER", { orderId: "ord_100", total: 25000 }, mutationId);

    const remoteOrderSpy = vi.fn().mockResolvedValue({ success: true, id: "server_ord_1" });
    const handlers = {
      createOrder: remoteOrderSpy,
    };

    const result = await queue.flush(handlers);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(remoteOrderSpy).toHaveBeenCalledTimes(1);
    expect(remoteOrderSpy).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ord_100", clientMutationId: mutationId })
    );

    // A fila deve ficar vazia após o envio com sucesso
    expect(queue.getQueue().length).toBe(0);
  });

  it("5. Confirma envio ÚNICO sem duplicados (Idempotência rigorosa)", async () => {
    const queue = new SyncQueue("test_queue", "test_processed");
    const mutationId = "mutation_idempotent_order";

    queue.enqueue("CREATE_ORDER", { orderId: "ord_200" }, mutationId);

    const remoteOrderSpy = vi.fn().mockResolvedValue({ success: true });
    const handlers = { createOrder: remoteOrderSpy };

    // Primeiro flush: processa a encomenda
    await queue.flush(handlers);
    expect(remoteOrderSpy).toHaveBeenCalledTimes(1);

    // Tentar enfileirar ou reenviar a mesma mutação não pode chamar o servidor novamente
    queue.enqueue("CREATE_ORDER", { orderId: "ord_200" }, mutationId);
    await queue.flush(handlers);

    expect(remoteOrderSpy).toHaveBeenCalledTimes(1); // Não voltou a ser chamada!
  });

  it("6. Resiliência: falha transitória de rede mantém o item na fila com retry", async () => {
    const queue = new SyncQueue("test_queue", "test_processed");
    const mutationId = "mutation_network_fail";

    queue.enqueue("CREATE_ORDER", { orderId: "ord_fail" }, mutationId);

    const networkErrorSpy = vi.fn().mockRejectedValue(new Error("Network timeout in Uige"));
    const handlers = { createOrder: networkErrorSpy };

    const result = await queue.flush(handlers);
    expect(result.failed).toBe(1);
    expect(result.processed).toBe(0);

    // O item continua na fila com retry incrementado
    const pending = queue.getQueue();
    expect(pending.length).toBe(1);
    expect(pending[0].retries).toBe(1);
  });
});
