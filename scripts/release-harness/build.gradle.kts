plugins { id("com.android.application") version "9.2.1" }

android {
    namespace = "com.tingwu.harness"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.tingwu.mobile.harness"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1"
    }
    // A separate, unshrunk test application includes its own AndroidX Test dependencies.
    // This can instrument the already-built release APK without changing its shrinker rules.
    signingConfigs.getByName("debug") {
        storeFile = file(providers.environmentVariable("TINGWU_KEYSTORE_PATH").get())
        storePassword = providers.environmentVariable("TINGWU_KEYSTORE_PASSWORD").get()
        keyAlias = providers.environmentVariable("TINGWU_KEY_ALIAS").orElse("tingwu").get()
        keyPassword = providers.environmentVariable("TINGWU_KEY_PASSWORD")
            .orElse(providers.environmentVariable("TINGWU_KEYSTORE_PASSWORD")).get()
    }
    sourceSets.getByName("main").apply {
        kotlin.directories.add("../../app/src/androidTest/java")
        assets.directories.add("../fixtures")
        assets.directories.add(providers.gradleProperty("tingwuRecorderTestAssets").get())
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.test.ext:junit:1.2.1")
    implementation("androidx.test:runner:1.6.2")
    implementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
