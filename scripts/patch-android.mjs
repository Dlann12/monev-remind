import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml')

if (!existsSync(manifestPath)) {
  console.log('AndroidManifest.xml not found, skipping Android patch.')
  process.exit(0)
}

// 1. Patch AndroidManifest.xml permissions
let manifest = readFileSync(manifestPath, 'utf-8')
const permissions = [
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE'
]

const missing = permissions.filter((perm) => !manifest.includes(perm))
if (missing.length > 0) {
  const tags = missing
    .map((perm) => `    <uses-permission android:name="${perm}" />`)
    .join('\n')
  manifest = manifest.replace('<application', `${tags}\n\n    <application`)
  console.log(`Added ${missing.length} permissions to AndroidManifest.xml`)
}

if (!manifest.includes('android:networkSecurityConfig')) {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:networkSecurityConfig="@xml/network_security_config"\n        android:usesCleartextTraffic="true"'
  )
  console.log('Added networkSecurityConfig & usesCleartextTraffic to AndroidManifest.xml')
}

writeFileSync(manifestPath, manifest, 'utf-8')

// 1b. Create res/xml/network_security_config.xml (allows http->https SSO redirect on kemnaker.go.id)
const xmlDir = resolve(root, 'android/app/src/main/res/xml')
mkdirSync(xmlDir, { recursive: true })
const networkSecurityXml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">kemnaker.go.id</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`
writeFileSync(resolve(xmlDir, 'network_security_config.xml'), networkSecurityXml, 'utf-8')
console.log('Generated res/xml/network_security_config.xml')

// 2. Write native MonevSyncPlugin.java (uses WebView CookieManager to fetch /users/me and /users/me/home)
const javaPkgDir = resolve(
  root,
  'android/app/src/main/java/id/go/kemnaker/maganghub/reminder'
)
mkdirSync(javaPkgDir, { recursive: true })

const monevSyncJava = `package id.go.kemnaker.maganghub.reminder;

import android.webkit.CookieManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "MonevSync")
public class MonevSyncPlugin extends Plugin {

    private static final String API_BASE = "https://monev-api.maganghub.kemnaker.go.id/api/v1";
    private static final String WEB_ORIGIN = "https://monev.maganghub.kemnaker.go.id";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        CookieManager.getInstance().setAcceptCookie(true);
    }

    @PluginMethod
    public void checkTodayStatus(final PluginCall call) {
        final String cachedToken = call.getString("accessToken", "");
        executor.execute(() -> {
            try {
                CookieManager cm = CookieManager.getInstance();
                cm.flush();
                String apiCookies = cm.getCookie(API_BASE);
                if (apiCookies == null) apiCookies = "";

                if (apiCookies.isEmpty() && (cachedToken == null || cachedToken.isEmpty())) {
                    JSObject res = new JSObject();
                    res.put("state", "session_expired");
                    res.put("reason", "no_cookie");
                    call.resolve(res);
                    return;
                }

                String token = cachedToken;
                if (token == null || token.isEmpty()) {
                    RefreshResult refresh = refreshAccessToken(cm, apiCookies);
                    if (!"ok".equals(refresh.state)) {
                        JSObject res = new JSObject();
                        res.put("state", refresh.state);
                        res.put("httpStatus", refresh.httpStatus);
                        call.resolve(res);
                        return;
                    }
                    token = refresh.accessToken;
                    apiCookies = cm.getCookie(API_BASE);
                    if (apiCookies == null) apiCookies = "";
                }

                HttpResult homeRes = requestJson(
                    API_BASE + "/users/me/home",
                    "GET",
                    apiCookies,
                    token
                );

                // Retry once with /auth/refresh if cached token expired
                if ((homeRes.status == 401 || homeRes.status == 403) && !apiCookies.isEmpty()) {
                    RefreshResult refresh = refreshAccessToken(cm, apiCookies);
                    if (!"ok".equals(refresh.state)) {
                        JSObject res = new JSObject();
                        res.put("state", refresh.state);
                        res.put("httpStatus", refresh.httpStatus);
                        call.resolve(res);
                        return;
                    }
                    token = refresh.accessToken;
                    apiCookies = cm.getCookie(API_BASE);
                    if (apiCookies == null) apiCookies = "";
                    homeRes = requestJson(API_BASE + "/users/me/home", "GET", apiCookies, token);
                }

                if (homeRes.status == 401 || homeRes.status == 403) {
                    JSObject res = new JSObject();
                    res.put("state", "session_expired");
                    res.put("httpStatus", homeRes.status);
                    call.resolve(res);
                    return;
                }

                if (homeRes.status < 200 || homeRes.status >= 300 || homeRes.body == null) {
                    JSObject res = new JSObject();
                    res.put("state", "unavailable");
                    res.put("httpStatus", homeRes.status);
                    call.resolve(res);
                    return;
                }

                JSONObject homeRoot = new JSONObject(homeRes.body);
                JSONObject homeData = homeRoot.has("data") && !homeRoot.isNull("data")
                    ? homeRoot.getJSONObject("data")
                    : homeRoot;

                // Also fetch /users/me and /attendances so profile and history strictly follow Monev MagangHub
                JSObject userObj = new JSObject();
                JSONArray attendancesArr = new JSONArray();
                HttpResult userRes = requestJson(API_BASE + "/users/me", "GET", apiCookies, token);
                if (userRes.status >= 200 && userRes.status < 300 && userRes.body != null) {
                    JSONObject userRoot = new JSONObject(userRes.body);
                    JSONObject u = userRoot.has("data") && !userRoot.isNull("data")
                        ? userRoot.getJSONObject("data")
                        : userRoot;
                    String userId = u.optString("id", "");
                    String startRaw = u.optString("internship_start_date", "");
                    String endRaw = u.optString("internship_end_date", "");

                    userObj.put("id", userId);
                    userObj.put("name", u.optString("name", ""));
                    userObj.put("user_type", u.optString("user_type", ""));
                    userObj.put("company", u.optString("company", ""));
                    userObj.put("internship_company", u.optString("internship_company", ""));
                    userObj.put("internship_position", u.optString("internship_position", ""));
                    userObj.put("position", u.optString("position", ""));
                    userObj.put("photo_url", u.optString("photo_url", ""));
                    userObj.put("internship_start_date", startRaw);
                    userObj.put("internship_end_date", endRaw);

                    if (!userId.isEmpty() && startRaw.length() >= 10) {
                        String startDate = startRaw.substring(0, 10);
                        String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                        String endDate = endRaw.length() >= 10 && endRaw.substring(0, 10).compareTo(todayStr) < 0
                            ? endRaw.substring(0, 10)
                            : todayStr;
                        if (endDate.compareTo(startDate) >= 0) {
                            String attUrl = API_BASE + "/attendances?participant_id="
                                + URLEncoder.encode(userId, "UTF-8")
                                + "&start_date=" + URLEncoder.encode(startDate, "UTF-8")
                                + "&end_date=" + URLEncoder.encode(endDate, "UTF-8")
                                + "&limit=500";
                            HttpResult attRes = requestJson(attUrl, "GET", apiCookies, token);
                            if (attRes.status >= 200 && attRes.status < 300 && attRes.body != null) {
                                JSONObject attRoot = new JSONObject(attRes.body);
                                if (attRoot.has("data") && !attRoot.isNull("data")) {
                                    attendancesArr = attRoot.getJSONArray("data");
                                }
                            }
                        }
                    }
                }

                JSObject res = new JSObject();
                res.put("state", "ok");
                res.put("hasAttendance", homeData.optBoolean("has_attendance", false));
                res.put("isScheduledOffDay", homeData.optBoolean("is_scheduled_off_day", false));
                res.put("isHoliday", homeData.optBoolean("is_holiday", false));
                res.put("accessToken", token);
                res.put("user", userObj);
                res.put("attendances", attendancesArr);
                call.resolve(res);
            } catch (Exception ex) {
                JSObject res = new JSObject();
                res.put("state", "unavailable");
                res.put("error", ex.getMessage());
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void clearPortalSession(PluginCall call) {
        CookieManager.getInstance().removeSessionCookies(null);
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        call.resolve();
    }

    private RefreshResult refreshAccessToken(CookieManager cm, String cookies) throws Exception {
        HttpResult res = requestJson(API_BASE + "/auth/refresh", "POST", cookies, null);
        saveSetCookies(cm, res.setCookies);

        if (res.status == 401 || res.status == 403) {
            return new RefreshResult("session_expired", res.status, "");
        }
        if (res.status < 200 || res.status >= 300 || res.body == null) {
            return new RefreshResult("unavailable", res.status, "");
        }

        JSONObject root = new JSONObject(res.body);
        String token = root.optString("access_token", "");
        if (token.isEmpty() && root.has("data") && !root.isNull("data")) {
            token = root.getJSONObject("data").optString("access_token", "");
        }
        if (token.isEmpty()) {
            return new RefreshResult("session_expired", res.status, "");
        }
        return new RefreshResult("ok", res.status, token);
    }

    private void saveSetCookies(CookieManager cm, List<String> setCookies) {
        if (setCookies == null) return;
        for (String cookie : setCookies) {
            cm.setCookie(API_BASE, cookie);
            cm.setCookie(WEB_ORIGIN, cookie);
        }
        cm.flush();
    }

    private HttpResult requestJson(String urlStr, String method, String cookies, String bearerToken)
        throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(12000);
        conn.setUseCaches(false);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("Origin", WEB_ORIGIN);
        conn.setRequestProperty("Referer", WEB_ORIGIN + "/");
        if (cookies != null && !cookies.isEmpty()) {
            conn.setRequestProperty("Cookie", cookies);
        }
        if (bearerToken != null && !bearerToken.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
        }
        if ("POST".equals(method)) {
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(0);
        }

        int status = conn.getResponseCode();
        InputStream stream = status >= 200 && status < 400
            ? conn.getInputStream()
            : conn.getErrorStream();

        StringBuilder sb = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8)
            )) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }
        }

        List<String> setCookies = null;
        Map<String, List<String>> headers = conn.getHeaderFields();
        if (headers != null) {
            setCookies = headers.get("Set-Cookie");
            if (setCookies == null) {
                setCookies = headers.get("set-cookie");
            }
        }

        conn.disconnect();
        return new HttpResult(status, sb.toString(), setCookies);
    }

    private static final class RefreshResult {
        final String state;
        final int httpStatus;
        final String accessToken;

        RefreshResult(String state, int httpStatus, String accessToken) {
            this.state = state;
            this.httpStatus = httpStatus;
            this.accessToken = accessToken;
        }
    }

    private static final class HttpResult {
        final int status;
        final String body;
        final List<String> setCookies;

        HttpResult(int status, String body, List<String> setCookies) {
            this.status = status;
            this.body = body;
            this.setCookies = setCookies;
        }
    }
}
`

writeFileSync(resolve(javaPkgDir, 'MonevSyncPlugin.java'), monevSyncJava, 'utf-8')
console.log('Generated MonevSyncPlugin.java')

// 3. Register MonevSyncPlugin in MainActivity.java
const mainActivityPath = resolve(javaPkgDir, 'MainActivity.java')
const mainActivityJava = `package id.go.kemnaker.maganghub.reminder;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MonevSyncPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`
writeFileSync(mainActivityPath, mainActivityJava, 'utf-8')
console.log('Patched MainActivity.java to register MonevSyncPlugin')

// 4. Create valid notification vector icon res/drawable/ic_stat_alarm.xml
const drawableDir = resolve(root, 'android/app/src/main/res/drawable')
mkdirSync(drawableDir, { recursive: true })

const alarmIconXml = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="#FFFFFF">
    <path
        android:fillColor="@android:color/white"
        android:pathData="M22,5.72l-4.6,-3.86 -1.29,1.53 4.6,3.86L22,5.72zM7.88,3.39L6.6,1.86 2,5.71l1.29,1.53 4.59,-3.85zM12.5,8H11v6l4.75,2.85 0.75,-1.23 -4,-2.37V8zM12,4c-4.97,0 -9,4.03 -9,9s4.02,9 9,9c4.97,0 9,-4.03 9,-9s-4.03,-9 -9,-9zM12,20c-3.87,0 -7,-3.13 -7,-7s3.13,-7 7,-7 7,3.13 7,7 -3.13,7 -7,7z" />
</vector>
`
writeFileSync(resolve(drawableDir, 'ic_stat_alarm.xml'), alarmIconXml, 'utf-8')
console.log('Generated res/drawable/ic_stat_alarm.xml')

// 5. Bump minSdkVersion to 26 (required by @capacitor/inappbrowser / ioninappbrowser-android)
const variablesGradlePath = resolve(root, 'android/variables.gradle')
if (existsSync(variablesGradlePath)) {
  const varsContent = readFileSync(variablesGradlePath, 'utf-8')
  const updatedVars = varsContent.replace(
    /minSdkVersion\s*=\s*\d+/,
    'minSdkVersion = 26'
  )
  writeFileSync(variablesGradlePath, updatedVars, 'utf-8')
  console.log('Updated minSdkVersion = 26 in android/variables.gradle')
}

// 6. Replace default Capacitor launcher icons & splash with custom MagangHub Reminder branding
const resDir = resolve(root, 'android/app/src/main/res')
const customAssetsDir = resolve(root, 'resources/android')
const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

for (const density of densities) {
  const srcMipmap = resolve(customAssetsDir, `mipmap-${density}`)
  const dstMipmap = resolve(resDir, `mipmap-${density}`)
  if (!existsSync(srcMipmap)) continue
  mkdirSync(dstMipmap, { recursive: true })
  for (const file of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    const srcFile = resolve(srcMipmap, file)
    if (existsSync(srcFile)) {
      copyFileSync(srcFile, resolve(dstMipmap, file))
    }
  }
}

const icBgXmlPath = resolve(resDir, 'values/ic_launcher_background.xml')
writeFileSync(
  icBgXmlPath,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#002242</color>\n</resources>\n`,
  'utf-8'
)

// Clean default Capacitor splash.png variants and install centered vector-safe splash.xml
const splashDirs = [
  'drawable',
  'drawable-land-hdpi',
  'drawable-land-mdpi',
  'drawable-land-xhdpi',
  'drawable-land-xxhdpi',
  'drawable-land-xxxhdpi',
  'drawable-port-hdpi',
  'drawable-port-mdpi',
  'drawable-port-xhdpi',
  'drawable-port-xxhdpi',
  'drawable-port-xxxhdpi'
]
for (const dir of splashDirs) {
  const sp = resolve(resDir, dir, 'splash.png')
  if (existsSync(sp)) {
    rmSync(sp)
  }
}

const splashLogoSrc = resolve(customAssetsDir, 'splash_logo.png')
if (existsSync(splashLogoSrc)) {
  const nodpiDir = resolve(resDir, 'drawable-nodpi')
  mkdirSync(nodpiDir, { recursive: true })
  copyFileSync(splashLogoSrc, resolve(nodpiDir, 'splash_logo.png'))

  writeFileSync(
    resolve(resDir, 'drawable/splash.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n    <item android:drawable="@color/ic_launcher_background" />\n    <item>\n        <bitmap\n            android:gravity="center"\n            android:src="@drawable/splash_logo" />\n    </item>\n</layer-list>\n`,
    'utf-8'
  )
}
console.log('Applied custom MagangHub Reminder launcher icons and splash screen')
