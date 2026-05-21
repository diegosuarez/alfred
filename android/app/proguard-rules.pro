# Keep Retrofit's reflection-based annotations alive in release builds.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations

# Kotlinx Serialization - keep generated serializers for our @Serializable models.
-keep,includedescriptorclasses class es.tcdn.diego.alfred.**$$serializer { *; }
-keepclassmembers class es.tcdn.diego.alfred.** {
    *** Companion;
}
-keepclasseswithmembers class es.tcdn.diego.alfred.** {
    kotlinx.serialization.KSerializer serializer(...);
}
