# =========================================================================
# REGRAS DE R8 / PROGUARD PARA MERCADO UÍGE (ao.mercadouige.app)
# =========================================================================

# Manter classes e anotações do Capacitor
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }

# Manter plugins nativos do Capacitor
-keep class com.capacitorjs.plugins.** { *; }
-keep interface com.capacitorjs.plugins.** { *; }

# JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Webkit
-keepattributes JavascriptInterface
-keepattributes *Annotation*

# Manter modelos nativos e DTOs
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
