plugins {
    id("com.android.application")
}

android {
    namespace = "com.tingwu.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tingwu.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 13
        versionName = "1.0.12"

        buildConfigField("String", "TINGWU_URL", "\"https://tingwu.aliyun.com/\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    val releaseKeystorePath = providers.environmentVariable("TINGWU_KEYSTORE_PATH").orNull
    if (!releaseKeystorePath.isNullOrBlank()) {
        signingConfigs {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = providers.environmentVariable("TINGWU_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("TINGWU_KEY_ALIAS").orElse("tingwu").get()
                keyPassword = providers.environmentVariable("TINGWU_KEY_PASSWORD")
                    .orElse(providers.environmentVariable("TINGWU_KEYSTORE_PASSWORD")).get()
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isDebuggable = false
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = false
    }

    sourceSets.getByName("androidTest").assets.directories.add("../scripts/fixtures")
    providers.gradleProperty("tingwuRecorderTestAssets").orNull?.let {
        sourceSets.getByName("androidTest").assets.directories.add(it)
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.webkit:webkit:1.14.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
