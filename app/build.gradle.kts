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
        versionCode = 2
        versionName = "1.0.1"

        buildConfigField("String", "TINGWU_URL", "\"https://tingwu.aliyun.com/\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
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
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")

    testImplementation("junit:junit:4.13.2")
}
