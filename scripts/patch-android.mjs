import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml')

if (!existsSync(manifestPath)) {
  console.log('AndroidManifest.xml not found, skipping Android patch.')
  process.exit(0)
}

// 1. Patch AndroidManifest.xml permissions, network config, and Receivers
let manifest = readFileSync(manifestPath, 'utf-8')
const permissions = [
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.FOREGROUND_SERVICE'
]

const missing = permissions.filter((perm) => !manifest.includes(perm))
if (missing.length > 0) {
  const tags = missing
    .map((perm) => `    <uses-permission android:name="${perm}" />`)
    .join('\n')
  manifest = manifest.replace('<application', `${tags}\n\n    <application`)
  console.log(`Added ${missing.length} permissions to AndroidManifest.xml`)
}

manifest = manifest.replace(/\s*android:usesCleartextTraffic="true"/g, '')
if (!manifest.includes('android:networkSecurityConfig')) {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:networkSecurityConfig="@xml/network_security_config"'
  )
  console.log('Added networkSecurityConfig to AndroidManifest.xml')
}

if (!manifest.includes('AutoMonevReceiver')) {
  const receiverTag = `
        <receiver
            android:name="id.go.kemnaker.maganghub.reminder.AutoMonevReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="id.go.kemnaker.maganghub.reminder.ACTION_AUTO_FILL_MONEV" />
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
    </application>`
  manifest = manifest.replace('</application>', receiverTag)
  console.log('Registered AutoMonevReceiver in AndroidManifest.xml')
}

if (!manifest.includes('AlarmReceiver')) {
  const alarmReceiverTag = `
        <receiver
            android:name="id.go.kemnaker.maganghub.reminder.AlarmReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="id.go.kemnaker.maganghub.reminder.ACTION_TRIGGER_MONEV_ALARM" />
                <action android:name="id.go.kemnaker.maganghub.reminder.ACTION_STOP_ALARM_SOUND" />
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
    </application>`
  manifest = manifest.replace('</application>', alarmReceiverTag)
  console.log('Registered AlarmReceiver in AndroidManifest.xml')
}

if (!manifest.includes('androidx.core.content.FileProvider')) {
  const providerTag = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="id.go.kemnaker.maganghub.reminder.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>`
  manifest = manifest.replace('</application>', providerTag)
  console.log('Registered FileProvider in AndroidManifest.xml')
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

// 1c. Create res/xml/file_paths.xml (for FileProvider APK installation)
const filePathsXml = `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <external-cache-path name="external_cache" path="." />
    <cache-path name="internal_cache" path="." />
    <external-files-path name="external_files" path="." />
    <files-path name="internal_files" path="." />
</paths>
`
writeFileSync(resolve(xmlDir, 'file_paths.xml'), filePathsXml, 'utf-8')
console.log('Generated res/xml/file_paths.xml')

// 2. Write Java classes for Monev portal sync, complete history fetching, and 23:00 auto-fill
const javaPkgDir = resolve(
  root,
  'android/app/src/main/java/id/go/kemnaker/maganghub/reminder'
)
mkdirSync(javaPkgDir, { recursive: true })

const monevApiHelperJava = `package id.go.kemnaker.maganghub.reminder;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.webkit.CookieManager;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

final class MonevApiHelper {

    static final String API_BASE = "https://monev-api.maganghub.kemnaker.go.id/api/v1";
    static final String WEB_ORIGIN = "https://monev.maganghub.kemnaker.go.id";
    static final String PREFS_NAME = "monev_auto_fill_prefs";

    private MonevApiHelper() {}

    static RefreshResult refreshAccessToken(CookieManager cm, String cookies) throws Exception {
        HttpResult res = requestJson(API_BASE + "/auth/refresh", "POST", cookies, null, null);
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

    static AuthContext resolveAuthenticatedSession(String cachedToken) throws Exception {
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.flush();

        String apiCookies = cm.getCookie(API_BASE);
        if (apiCookies == null) apiCookies = "";

        if (apiCookies.isEmpty() && (cachedToken == null || cachedToken.isEmpty())) {
            return new AuthContext("session_expired", "no_cookie", 0, "", "");
        }

        String token = cachedToken != null ? cachedToken : "";
        if (token.isEmpty()) {
            RefreshResult refresh = refreshAccessToken(cm, apiCookies);
            if (!"ok".equals(refresh.state)) {
                return new AuthContext(refresh.state, "", refresh.httpStatus, "", "");
            }
            token = refresh.accessToken;
            apiCookies = cm.getCookie(API_BASE);
            if (apiCookies == null) apiCookies = "";
        }

        return new AuthContext("ok", "", 200, token, apiCookies);
    }

    static AuthContext revalidateOnUnauthorized(String currentCookies) throws Exception {
        CookieManager cm = CookieManager.getInstance();
        String apiCookies = currentCookies != null ? currentCookies : cm.getCookie(API_BASE);
        if (apiCookies == null || apiCookies.isEmpty()) {
            return new AuthContext("session_expired", "no_cookie", 401, "", "");
        }
        RefreshResult refresh = refreshAccessToken(cm, apiCookies);
        if (!"ok".equals(refresh.state)) {
            return new AuthContext(refresh.state, "", refresh.httpStatus, "", "");
        }
        String refreshedCookies = cm.getCookie(API_BASE);
        if (refreshedCookies == null) refreshedCookies = "";
        return new AuthContext("ok", "", refresh.httpStatus, refresh.accessToken, refreshedCookies);
    }

    static JSONArray fetchPaginatedAttendances(
        String userId,
        String startDate,
        String endDate,
        String cookies,
        String token
    ) {
        JSONArray combined = new JSONArray();
        final int pageSize = 100;
        try {
            for (int page = 1; page <= 15; page++) {
                String attUrl = API_BASE + "/attendances?participant_id="
                    + URLEncoder.encode(userId, "UTF-8")
                    + "&start_date=" + URLEncoder.encode(startDate, "UTF-8")
                    + "&end_date=" + URLEncoder.encode(endDate, "UTF-8")
                    + "&page=" + page
                    + "&limit=" + pageSize;
                HttpResult attRes = requestJson(attUrl, "GET", cookies, token, null);
                if (attRes.status < 200 || attRes.status >= 300 || attRes.body == null) {
                    break;
                }
                JSONObject attRoot = new JSONObject(attRes.body);
                if (!attRoot.has("data") || attRoot.isNull("data")) {
                    break;
                }
                JSONArray pageArr = attRoot.getJSONArray("data");
                for (int i = 0; i < pageArr.length(); i++) {
                    combined.put(pageArr.get(i));
                }
                int total = attRoot.optInt("total", -1);
                if (pageArr.length() < pageSize || (total >= 0 && combined.length() >= total)) {
                    break;
                }
            }
        } catch (Exception ignored) {
            // Return items fetched so far
        }
        return combined;
    }

    static JSONArray fetchPaginatedHolidays(String cookies, String token) {
        JSONArray combined = new JSONArray();
        final int pageSize = 100;
        try {
            for (int page = 1; page <= 10; page++) {
                String url = API_BASE + "/holidays?page=" + page + "&limit=" + pageSize;
                HttpResult res = requestJson(url, "GET", cookies, token, null);
                if (res.status < 200 || res.status >= 300 || res.body == null) {
                    break;
                }
                JSONObject root = new JSONObject(res.body);
                if (!root.has("data") || root.isNull("data")) {
                    break;
                }
                JSONArray pageArr = root.getJSONArray("data");
                for (int i = 0; i < pageArr.length(); i++) {
                    combined.put(pageArr.get(i));
                }
                int total = root.optInt("total", -1);
                if (pageArr.length() < pageSize || (total >= 0 && combined.length() >= total)) {
                    break;
                }
            }
        } catch (Exception ignored) {
            // Return items fetched so far
        }
        return combined;
    }

    static JSONArray fetchDailyLogsForMonth(
        String userId,
        String monthFirstDate,
        String cookies,
        String token
    ) {
        JSONArray result = new JSONArray();
        try {
            String url = API_BASE + "/daily-logs?participant_id="
                + URLEncoder.encode(userId, "UTF-8")
                + "&date=" + URLEncoder.encode(monthFirstDate, "UTF-8")
                + "&limit=100";
            HttpResult res = requestJson(url, "GET", cookies, token, null);
            if (res.status >= 200 && res.status < 300 && res.body != null) {
                JSONObject root = new JSONObject(res.body);
                if (root.has("data") && !root.isNull("data")) {
                    result = root.getJSONArray("data");
                }
            }
        } catch (Exception ignored) {
            // Ignore failing month fetch
        }
        return result;
    }

    static JSONArray fetchDailyLogsInRange(
        String userId,
        String startDate,
        String endDate,
        String cookies,
        String token
    ) {
        JSONArray combined = new JSONArray();
        try {
            SimpleDateFormat ymFmt = new SimpleDateFormat("yyyy-MM", Locale.US);
            Date startD = ymFmt.parse(startDate.substring(0, 7));
            Date endD = ymFmt.parse(endDate.substring(0, 7));
            if (startD == null || endD == null) return combined;

            Calendar cur = Calendar.getInstance();
            cur.setTime(startD);
            cur.set(Calendar.DAY_OF_MONTH, 1);

            Calendar endCal = Calendar.getInstance();
            endCal.setTime(endD);
            endCal.set(Calendar.DAY_OF_MONTH, 1);

            int guard = 0;
            while (!cur.after(endCal) && guard < 24) {
                String monthFirst = ymFmt.format(cur.getTime()) + "-01";
                JSONArray monthArr = fetchDailyLogsForMonth(userId, monthFirst, cookies, token);
                for (int i = 0; i < monthArr.length(); i++) {
                    combined.put(monthArr.get(i));
                }
                cur.add(Calendar.MONTH, 1);
                guard++;
            }
        } catch (Exception ignored) {
            // Ignore malformed date range
        }
        return combined;
    }

    static JSONObject findLatestDailyLogBefore(
        String userId,
        String targetDate,
        String cookies,
        String token
    ) {
        JSONObject best = null;
        String bestDate = "";

        try {
            SimpleDateFormat ymFmt = new SimpleDateFormat("yyyy-MM", Locale.US);
            Date baseDate = ymFmt.parse(targetDate.substring(0, 7));
            if (baseDate == null) baseDate = new Date();

            Calendar cal = Calendar.getInstance();
            cal.setTime(baseDate);
            cal.set(Calendar.DAY_OF_MONTH, 1);

            for (int offset = 0; offset < 3; offset++) {
                String monthFirst = ymFmt.format(cal.getTime()) + "-01";
                JSONArray arr = fetchDailyLogsForMonth(userId, monthFirst, cookies, token);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.optJSONObject(i);
                    if (item == null) continue;
                    String rawDate = item.optString("date", "");
                    if (rawDate.length() < 10) continue;
                    String dateKey = rawDate.substring(0, 10);
                    if (dateKey.compareTo(targetDate) >= 0) continue;

                    String activityLog = item.optString("activity_log", "").trim();
                    if (activityLog.isEmpty()) continue;

                    if (dateKey.compareTo(bestDate) > 0) {
                        bestDate = dateKey;
                        best = item;
                    }
                }
                if (best != null) break;
                cal.add(Calendar.MONTH, -1);
            }
        } catch (Exception ignored) {
            // Fall through returning best found so far
        }
        return best;
    }

    static String ensureMin100Chars(String raw, String kind) {
        String cleaned = raw == null ? "" : raw.replaceAll("\\\\s+", " ").trim();
        if (cleaned.length() >= 100) return cleaned;
        if (cleaned.isEmpty()) {
            if ("lesson".equals(kind)) {
                return "Memperoleh pemahaman praktis mengenai alur kerja tim, koordinasi operasional, komunikasi profesional, serta standar penyelesaian tugas harian di lingkungan magang.";
            }
            if ("obstacles".equals(kind)) {
                return "Tidak terdapat kendala signifikan selama pelaksanaan kegiatan hari ini; seluruh koordinasi pekerjaan dan penyelesaian tugas bersama tim berjalan lancar sesuai rencana.";
            }
            return "Melaksanakan rangkaian kegiatan operasional harian magang sesuai arahan mentor serta memastikan seluruh target tugas selesai tepat waktu.";
        }
        String suffix;
        if ("lesson".equals(kind)) {
            suffix = "Pembelajaran ini meningkatkan pemahaman terhadap alur kerja tim, standar kualitas operasional, serta ketepatan koordinasi harian di tempat magang.";
        } else if ("obstacles".equals(kind)) {
            suffix = "Kendala yang ditemui dapat diatasi dengan baik melalui koordinasi bersama mentor dan rekan tim sehingga seluruh tugas harian tetap berjalan lancar.";
        } else {
            suffix = "Kegiatan dilaksanakan secara konsisten bersama tim sesuai arahan mentor lapangan dan target evaluasi harian program magang.";
        }
        char last = cleaned.charAt(cleaned.length() - 1);
        String sep = (last == '.' || last == '!' || last == '?') ? " " : ". ";
        return cleaned + sep + suffix;
    }

    static AutoFillResult executeAutoFillToday(
        Context context,
        String cachedToken,
        String targetDateOverride,
        String fallbackActivityLog,
        String fallbackLessonLearned,
        String fallbackObstacles
    ) {
        return executeAutoFillToday(
            context,
            cachedToken,
            targetDateOverride,
            fallbackActivityLog,
            fallbackLessonLearned,
            fallbackObstacles,
            false
        );
    }

    static AutoFillResult executeAutoFillToday(
        Context context,
        String cachedToken,
        String targetDateOverride,
        String fallbackActivityLog,
        String fallbackLessonLearned,
        String fallbackObstacles,
        boolean preferFallback
    ) {
        String todayStr = (targetDateOverride != null && targetDateOverride.length() >= 10)
            ? targetDateOverride.substring(0, 10)
            : new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());

        try {
            AuthContext auth = resolveAuthenticatedSession(cachedToken);
            if (!"ok".equals(auth.state)) {
                return AutoFillResult.error(auth.state, auth.reason, auth.httpStatus, "Sesi login MagangHub tidak aktif.");
            }

            String token = auth.accessToken;
            String cookies = auth.cookies;

            HttpResult homeRes = requestJson(API_BASE + "/users/me/home", "GET", cookies, token, null);
            if (homeRes.status == 401 || homeRes.status == 403) {
                AuthContext retry = revalidateOnUnauthorized(cookies);
                if (!"ok".equals(retry.state)) {
                    return AutoFillResult.error(retry.state, retry.reason, retry.httpStatus, "Sesi login MagangHub habis.");
                }
                token = retry.accessToken;
                cookies = retry.cookies;
                homeRes = requestJson(API_BASE + "/users/me/home", "GET", cookies, token, null);
            }

            if (homeRes.status == 401 || homeRes.status == 403) {
                return AutoFillResult.error("session_expired", "unauthorized", homeRes.status, "Sesi login MagangHub habis.");
            }
            if (homeRes.status < 200 || homeRes.status >= 300 || homeRes.body == null) {
                return AutoFillResult.error("unavailable", "http_error", homeRes.status, "Portal Kemnaker gagal dihubungi.");
            }

            JSONObject homeRoot = new JSONObject(homeRes.body);
            JSONObject homeData = homeRoot.has("data") && !homeRoot.isNull("data")
                ? homeRoot.getJSONObject("data")
                : homeRoot;

            if (homeData.optBoolean("is_scheduled_off_day", false) || homeData.optBoolean("is_holiday", false)) {
                AutoFillResult offRes = new AutoFillResult("off_day", "", 200, "Hari ini hari libur / di luar jadwal.", token);
                offRes.submittedDate = todayStr;
                return offRes;
            }
            if (homeData.optBoolean("has_attendance", false)) {
                AutoFillResult filledRes = new AutoFillResult("already_filled", "", 200, "Monev hari ini sudah terisi.", token);
                filledRes.submittedDate = todayStr;
                return filledRes;
            }

            String activityLog = "";
            String lessonLearned = "";
            String obstacles = "";
            String copiedFromDate = "";

            if (preferFallback && fallbackActivityLog != null && !fallbackActivityLog.trim().isEmpty()) {
                activityLog = fallbackActivityLog.trim();
                lessonLearned = fallbackLessonLearned != null ? fallbackLessonLearned.trim() : "";
                obstacles = fallbackObstacles != null ? fallbackObstacles.trim() : "";
            } else {
                HttpResult userRes = requestJson(API_BASE + "/users/me", "GET", cookies, token, null);
                String userId = "";
                if (userRes.status >= 200 && userRes.status < 300 && userRes.body != null) {
                    JSONObject userRoot = new JSONObject(userRes.body);
                    JSONObject u = userRoot.has("data") && !userRoot.isNull("data")
                        ? userRoot.getJSONObject("data")
                        : userRoot;
                    userId = u.optString("id", "");
                }

                if (!userId.isEmpty()) {
                    JSONObject latestLog = findLatestDailyLogBefore(userId, todayStr, cookies, token);
                    if (latestLog != null) {
                        copiedFromDate = latestLog.optString("date", "").length() >= 10
                            ? latestLog.optString("date", "").substring(0, 10)
                            : "";
                        activityLog = latestLog.optString("activity_log", "").trim();
                        lessonLearned = latestLog.optString("lesson_learned", "").trim();
                        obstacles = latestLog.optString("obstacles", "").trim();
                    }
                }

                if (activityLog.isEmpty() && fallbackActivityLog != null && !fallbackActivityLog.trim().isEmpty()) {
                    activityLog = fallbackActivityLog.trim();
                    lessonLearned = fallbackLessonLearned != null ? fallbackLessonLearned.trim() : "";
                    obstacles = fallbackObstacles != null ? fallbackObstacles.trim() : "";
                }
            }

            if (activityLog.isEmpty()) {
                return AutoFillResult.error("no_previous_log", "no_previous_log", 200, "Belum ada kegiatan kemarin yang bisa disalin.");
            }

            activityLog = ensureMin100Chars(activityLog, "activity");
            lessonLearned = ensureMin100Chars(lessonLearned, "lesson");
            obstacles = ensureMin100Chars(obstacles, "obstacles");

            JSONObject payload = new JSONObject();
            payload.put("date", todayStr);
            payload.put("status", "PRESENT");
            payload.put("activity_log", activityLog);
            payload.put("lesson_learned", lessonLearned);
            payload.put("obstacles", obstacles);

            HttpResult postRes = requestJson(
                API_BASE + "/attendances/with-daily-log",
                "POST",
                cookies,
                token,
                payload.toString()
            );

            if (postRes.status >= 200 && postRes.status < 300) {
                if (context != null) {
                    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit()
                        .putString("last_submitted_date", todayStr)
                        .putString("last_copied_from", copiedFromDate)
                        .putString("last_submit_status", "submitted")
                        .apply();
                }
                AutoFillResult ok = new AutoFillResult(
                    "submitted",
                    "",
                    postRes.status,
                    preferFallback
                        ? "Monev hari ini berhasil dikirim ke portal MagangHub."
                        : copiedFromDate.isEmpty()
                            ? "Auto-isi Monev 23:00 berhasil dikirim."
                            : "Auto-isi Monev 23:00 berhasil menyalin kegiatan " + copiedFromDate + ".",
                    token
                );
                ok.submittedDate = todayStr;
                ok.copiedFromDate = copiedFromDate;
                ok.activityLog = activityLog;
                ok.lessonLearned = lessonLearned;
                ok.obstacles = obstacles;
                return ok;
            }

            String errMsg = "Gagal mengirim Monev otomatis (HTTP " + postRes.status + ").";
            if (postRes.body != null && !postRes.body.isEmpty()) {
                try {
                    JSONObject errJson = new JSONObject(postRes.body);
                    String serverMsg = errJson.optString("message", "");
                    if (!serverMsg.isEmpty()) {
                        errMsg = serverMsg;
                    }
                } catch (Exception ignored) {
                    // Use HTTP error fallback
                }
            }
            return AutoFillResult.error(
                postRes.status == 401 || postRes.status == 403 ? "session_expired" : "unavailable",
                "submit_failed",
                postRes.status,
                errMsg
            );
        } catch (Exception ex) {
            return AutoFillResult.error("unavailable", "exception", 0, ex.getMessage() != null ? ex.getMessage() : "Kesalahan jaringan.");
        }
    }

    static void saveSetCookies(CookieManager cm, List<String> setCookies) {
        if (setCookies == null) return;
        for (String cookie : setCookies) {
            cm.setCookie(API_BASE, cookie);
            cm.setCookie(WEB_ORIGIN, cookie);
        }
        cm.flush();
    }

    static HttpResult requestJson(
        String urlStr,
        String method,
        String cookies,
        String bearerToken,
        String jsonBody
    ) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(15000);
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
        if ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method)) {
            conn.setDoOutput(true);
            if (jsonBody != null) {
                byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                }
            } else {
                conn.setFixedLengthStreamingMode(0);
            }
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

    static String fetchPhotoDataUrl(String rawUrl, String cookies, String bearerToken) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return "";
        String currentUrl = rawUrl.trim();
        if (currentUrl.startsWith("data:image/")) return currentUrl;
        if (currentUrl.startsWith("//")) {
            currentUrl = "https:" + currentUrl;
        } else if (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://")) {
            currentUrl = currentUrl.startsWith("/") ? (WEB_ORIGIN + currentUrl) : (WEB_ORIGIN + "/" + currentUrl);
        }

        try {
            byte[] imageBytes = null;
            for (int hop = 0; hop < 4; hop++) {
                URL url = new URL(currentUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(8000);
                conn.setInstanceFollowRedirects(false);
                conn.setRequestProperty("Accept", "image/*,*/*;q=0.8");
                conn.setRequestProperty("Referer", WEB_ORIGIN + "/");
                String host = url.getHost() != null ? url.getHost().toLowerCase(Locale.US) : "";
                if (host.endsWith("kemnaker.go.id")) {
                    if (cookies != null && !cookies.isEmpty()) {
                        conn.setRequestProperty("Cookie", cookies);
                    }
                    if (bearerToken != null && !bearerToken.isEmpty()) {
                        conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
                    }
                }

                int status = conn.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String loc = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (loc == null || loc.trim().isEmpty()) return "";
                    currentUrl = new URL(url, loc.trim()).toString();
                    continue;
                }

                if (status < 200 || status >= 300) {
                    conn.disconnect();
                    return "";
                }

                try (InputStream is = conn.getInputStream();
                     ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[8192];
                    int read;
                    int total = 0;
                    final int maxBytes = 3 * 1024 * 1024;
                    while ((read = is.read(buf)) != -1) {
                        total += read;
                        if (total > maxBytes) {
                            conn.disconnect();
                            return "";
                        }
                        baos.write(buf, 0, read);
                    }
                    imageBytes = baos.toByteArray();
                } finally {
                    conn.disconnect();
                }
                break;
            }

            if (imageBytes == null || imageBytes.length == 0) return "";

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return "";

            int targetSize = 160;
            int sampleSize = 1;
            while ((bounds.outWidth / (sampleSize * 2)) >= targetSize
                && (bounds.outHeight / (sampleSize * 2)) >= targetSize) {
                sampleSize *= 2;
            }

            BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
            decodeOpts.inSampleSize = sampleSize;
            Bitmap decoded = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length, decodeOpts);
            if (decoded == null) return "";

            int w = decoded.getWidth();
            int h = decoded.getHeight();
            int side = Math.min(w, h);
            int x = Math.max(0, (w - side) / 2);
            int y = Math.max(0, (h - side) / 2);
            Bitmap cropped = Bitmap.createBitmap(decoded, x, y, side, side);
            if (cropped != decoded) decoded.recycle();

            Bitmap scaled = side > targetSize
                ? Bitmap.createScaledBitmap(cropped, targetSize, targetSize, true)
                : cropped;
            if (scaled != cropped) cropped.recycle();

            ByteArrayOutputStream jpegOut = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, 82, jpegOut);
            scaled.recycle();

            return "data:image/jpeg;base64," + Base64.encodeToString(jpegOut.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        }
    }

    static final class AuthContext {
        final String state;
        final String reason;
        final int httpStatus;
        final String accessToken;
        final String cookies;

        AuthContext(String state, String reason, int httpStatus, String accessToken, String cookies) {
            this.state = state;
            this.reason = reason;
            this.httpStatus = httpStatus;
            this.accessToken = accessToken;
            this.cookies = cookies;
        }
    }

    static final class RefreshResult {
        final String state;
        final int httpStatus;
        final String accessToken;

        RefreshResult(String state, int httpStatus, String accessToken) {
            this.state = state;
            this.httpStatus = httpStatus;
            this.accessToken = accessToken;
        }
    }

    static final class HttpResult {
        final int status;
        final String body;
        final List<String> setCookies;

        HttpResult(int status, String body, List<String> setCookies) {
            this.status = status;
            this.body = body;
            this.setCookies = setCookies;
        }
    }

    static final class AutoFillResult {
        final String state;
        final String reason;
        final int httpStatus;
        final String message;
        final String accessToken;
        String submittedDate = "";
        String copiedFromDate = "";
        String activityLog = "";
        String lessonLearned = "";
        String obstacles = "";

        AutoFillResult(String state, String reason, int httpStatus, String message, String accessToken) {
            this.state = state;
            this.reason = reason;
            this.httpStatus = httpStatus;
            this.message = message;
            this.accessToken = accessToken;
        }

        static AutoFillResult error(String state, String reason, int httpStatus, String message) {
            return new AutoFillResult(state, reason, httpStatus, message, "");
        }
    }
}
`

const monevSyncJava = `package id.go.kemnaker.maganghub.reminder;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.CookieManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "MonevSync")
public class MonevSyncPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        CookieManager.getInstance().setAcceptCookie(true);
    }

    @PluginMethod
    public void checkTodayStatus(final PluginCall call) {
        final String cachedToken = call.getString("accessToken", "");
        final boolean includeHistory = Boolean.TRUE.equals(call.getBoolean("includeHistory", true));
        executor.execute(() -> {
            try {
                MonevApiHelper.AuthContext auth = MonevApiHelper.resolveAuthenticatedSession(cachedToken);
                if (!"ok".equals(auth.state)) {
                    JSObject res = new JSObject();
                    res.put("state", auth.state);
                    if (!auth.reason.isEmpty()) res.put("reason", auth.reason);
                    if (auth.httpStatus > 0) res.put("httpStatus", auth.httpStatus);
                    call.resolve(res);
                    return;
                }

                String token = auth.accessToken;
                String apiCookies = auth.cookies;

                MonevApiHelper.HttpResult homeRes = MonevApiHelper.requestJson(
                    MonevApiHelper.API_BASE + "/users/me/home",
                    "GET",
                    apiCookies,
                    token,
                    null
                );

                if (homeRes.status == 401 || homeRes.status == 403) {
                    MonevApiHelper.AuthContext retry = MonevApiHelper.revalidateOnUnauthorized(apiCookies);
                    if (!"ok".equals(retry.state)) {
                        JSObject res = new JSObject();
                        res.put("state", retry.state);
                        res.put("httpStatus", retry.httpStatus);
                        call.resolve(res);
                        return;
                    }
                    token = retry.accessToken;
                    apiCookies = retry.cookies;
                    homeRes = MonevApiHelper.requestJson(
                        MonevApiHelper.API_BASE + "/users/me/home",
                        "GET",
                        apiCookies,
                        token,
                        null
                    );
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

                JSObject userObj = new JSObject();
                JSONArray attendancesArr = new JSONArray();
                JSONArray dailyLogsArr = new JSONArray();
                JSONArray holidaysArr = new JSONArray();

                if (includeHistory) {
                    MonevApiHelper.HttpResult userRes = MonevApiHelper.requestJson(
                        MonevApiHelper.API_BASE + "/users/me",
                        "GET",
                        apiCookies,
                        token,
                        null
                    );

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
                        String rawPhotoUrl = u.optString("photo_url", "");
                        if (rawPhotoUrl.isEmpty()) rawPhotoUrl = u.optString("avatar_url", "");
                        if (rawPhotoUrl.isEmpty()) rawPhotoUrl = u.optString("avatar", "");
                        if (rawPhotoUrl.isEmpty()) rawPhotoUrl = u.optString("photo", "");
                        userObj.put("photo_url", rawPhotoUrl);
                        if (!rawPhotoUrl.isEmpty()) {
                            SharedPreferences photoPrefs = getContext().getSharedPreferences(
                                MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
                            );
                            String cachedUrl = photoPrefs.getString("cached_photo_url", "");
                            String cachedData = photoPrefs.getString("cached_photo_data_url", "");
                            String photoDataUrl;
                            if (rawPhotoUrl.equals(cachedUrl) && !cachedData.isEmpty()) {
                                photoDataUrl = cachedData;
                            } else {
                                photoDataUrl = MonevApiHelper.fetchPhotoDataUrl(rawPhotoUrl, apiCookies, token);
                                if (!photoDataUrl.isEmpty()) {
                                    photoPrefs.edit()
                                        .putString("cached_photo_url", rawPhotoUrl)
                                        .putString("cached_photo_data_url", photoDataUrl)
                                        .apply();
                                }
                            }
                            if (!photoDataUrl.isEmpty()) {
                                userObj.put("photo_data_url", photoDataUrl);
                            }
                        }
                        userObj.put("internship_start_date", startRaw);
                        userObj.put("internship_end_date", endRaw);
                        userObj.put("internship_location_province_code", u.optString("internship_location_province_code", ""));
                        userObj.put("internship_location_regency_code", u.optString("internship_location_regency_code", ""));
                        if (u.has("off_days") && !u.isNull("off_days")) {
                            userObj.put("off_days", u.getJSONArray("off_days"));
                        }

                        if (!userId.isEmpty() && startRaw.length() >= 10) {
                            String startDate = startRaw.substring(0, 10);
                            String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                            String endDate = endRaw.length() >= 10 && endRaw.substring(0, 10).compareTo(todayStr) < 0
                                ? endRaw.substring(0, 10)
                                : todayStr;
                            if (endDate.compareTo(startDate) >= 0) {
                                attendancesArr = MonevApiHelper.fetchPaginatedAttendances(
                                    userId, startDate, endDate, apiCookies, token
                                );
                                dailyLogsArr = MonevApiHelper.fetchDailyLogsInRange(
                                    userId, startDate, endDate, apiCookies, token
                                );
                            }
                        }
                        holidaysArr = MonevApiHelper.fetchPaginatedHolidays(apiCookies, token);
                    }
                }

                SharedPreferences prefs = getContext().getSharedPreferences(
                    MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
                );

                JSObject res = new JSObject();
                res.put("state", "ok");
                res.put("hasAttendance", homeData.optBoolean("has_attendance", false));
                res.put("isScheduledOffDay", homeData.optBoolean("is_scheduled_off_day", false));
                res.put("isHoliday", homeData.optBoolean("is_holiday", false));
                res.put("accessToken", token);
                if (includeHistory) {
                    res.put("user", userObj);
                    res.put("attendances", attendancesArr);
                    res.put("dailyLogs", dailyLogsArr);
                    res.put("holidays", holidaysArr);
                }
                res.put("lastAutoSubmittedDate", prefs.getString("last_submitted_date", ""));
                res.put("lastAutoCopiedFromDate", prefs.getString("last_copied_from", ""));
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
    public void submitAutoMonev(final PluginCall call) {
        final String cachedToken = call.getString("accessToken", "");
        final String targetDate = call.getString("targetDate", "");
        final String fallbackActivityLog = call.getString("activityLog", "");
        final String fallbackLessonLearned = call.getString("lessonLearned", "");
        final String fallbackObstacles = call.getString("obstacles", "");
        final boolean preferFallback = Boolean.TRUE.equals(call.getBoolean("preferFallback", false));

        executor.execute(() -> {
            MonevApiHelper.AutoFillResult result = MonevApiHelper.executeAutoFillToday(
                getContext(),
                cachedToken,
                targetDate,
                fallbackActivityLog,
                fallbackLessonLearned,
                fallbackObstacles,
                preferFallback
            );
            JSObject res = new JSObject();
            res.put("state", result.state);
            res.put("reason", result.reason);
            res.put("httpStatus", result.httpStatus);
            res.put("message", result.message);
            res.put("accessToken", result.accessToken);
            res.put("submittedDate", result.submittedDate);
            res.put("copiedFromDate", result.copiedFromDate);
            res.put("activityLog", result.activityLog);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void scheduleAutoFillAlarm(final PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        int hour = call.getInt("hour", 23);
        int minute = call.getInt("minute", 0);
        String holidayOverrideDate = call.getString("holidayOverrideDate", "");
        String workDaysCsv = call.getString("workDaysCsv", "1,2,3,4,5");

        SharedPreferences prefs = getContext().getSharedPreferences(
            MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
        );
        prefs.edit()
            .putBoolean("auto_fill_enabled", enabled)
            .putInt("auto_fill_hour", hour)
            .putInt("auto_fill_minute", minute)
            .putString("holiday_override_date", holidayOverrideDate != null ? holidayOverrideDate : "")
            .putString("work_days_csv", workDaysCsv != null && !workDaysCsv.isEmpty() ? workDaysCsv : "1,2,3,4,5")
            .apply();

        AutoMonevReceiver.scheduleNext(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getDeviceAlarmStatus(PluginCall call) {
        Context ctx = getContext();
        boolean canExact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            canExact = am != null && am.canScheduleExactAlarms();
        }
        boolean ignoringBattery = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            ignoringBattery = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        JSObject res = new JSObject();
        res.put("canScheduleExactAlarms", canExact);
        res.put("ignoringBatteryOptimizations", ignoringBattery);
        call.resolve(res);
    }

    @PluginMethod
    public void openDeviceAlarmSettings(PluginCall call) {
        String target = call.getString("target", "exact_alarm");
        Context ctx = getContext();
        Uri pkgUri = Uri.parse("package:" + ctx.getPackageName());
        Intent intent = null;
        if ("battery".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkgUri);
        }
        try {
            if (intent == null) {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Exception ex) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(fallback);
            } catch (Exception ignored) {
                // Ignore if no settings activity handles intent
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void clearPortalSession(PluginCall call) {
        CookieManager.getInstance().removeSessionCookies(null);
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        SharedPreferences prefs = getContext().getSharedPreferences(
            MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
        );
        prefs.edit().clear().apply();
        AutoMonevReceiver.cancelAlarm(getContext());
        call.resolve();
    }

    @PluginMethod
    public void syncNativeAlarmClocks(PluginCall call) {
        JSArray alarms = call.getArray("alarms");
        String timezone = call.getString("timezone", "Asia/Jakarta");
        String workDaysCsv = call.getString("workDaysCsv", "1,2,3,4,5");
        String holidayOverrideDate = call.getString("holidayOverrideDate", "");
        boolean todayFilled = Boolean.TRUE.equals(call.getBoolean("todayFilled", false));
        boolean snoozeEnabled = Boolean.TRUE.equals(call.getBoolean("snoozeEnabled", true));

        SharedPreferences prefs = getContext().getSharedPreferences(
            MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
        );
        prefs.edit()
            .putString("alarms_config", alarms != null ? alarms.toString() : "[]")
            .putString("alarm_timezone", timezone != null ? timezone : "Asia/Jakarta")
            .putString("work_days_csv", workDaysCsv != null ? workDaysCsv : "1,2,3,4,5")
            .putString("holiday_override_date", holidayOverrideDate != null ? holidayOverrideDate : "")
            .putBoolean("today_filled", todayFilled)
            .putBoolean("snooze_enabled", snoozeEnabled)
            .apply();

        AlarmReceiver.scheduleNextAlarmClock(getContext());
        JSObject res = new JSObject();
        res.put("scheduled", true);
        call.resolve(res);
    }

    @PluginMethod
    public void cancelNativeAlarmClocks(PluginCall call) {
        AlarmReceiver.cancelAlarmClock(getContext());
        AlarmReceiver.stopRinging(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stopAlarmAudio(PluginCall call) {
        AlarmReceiver.stopRinging(getContext());
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstallUpdate(final PluginCall call) {
        final String downloadUrl = call.getString("url", "");
        final String version = call.getString("version", "latest");
        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("URL download APK kosong");
            return;
        }

        executor.execute(() -> {
            try {
                Context context = getContext();
                File cacheDir = context.getExternalCacheDir() != null
                    ? context.getExternalCacheDir()
                    : context.getCacheDir();
                File apkFile = new File(cacheDir, "MagangHub-Reminder-" + version + ".apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                URL currentUrl = new URL(downloadUrl);
                HttpURLConnection conn = null;
                int redirects = 0;
                while (redirects < 5) {
                    conn = (HttpURLConnection) currentUrl.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", "MonevMagangHubReminder-Android");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.connect();

                    int status = conn.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP
                        || status == HttpURLConnection.HTTP_MOVED_PERM
                        || status == 307
                        || status == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (loc == null || loc.isEmpty()) break;
                        currentUrl = new URL(loc);
                        redirects++;
                    } else {
                        break;
                    }
                }

                if (conn == null) {
                    JSObject err = new JSObject();
                    err.put("state", "error");
                    err.put("error", "Koneksi ke server unduhan gagal.");
                    call.resolve(err);
                    return;
                }

                try (InputStream in = conn.getInputStream();
                     OutputStream out = new FileOutputStream(apkFile)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                    out.flush();
                }
                conn.disconnect();

                if (!apkFile.exists() || apkFile.length() < 10000) {
                    JSObject err = new JSObject();
                    err.put("state", "error");
                    err.put("error", "File APK yang diunduh tidak valid.");
                    call.resolve(err);
                    return;
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!context.getPackageManager().canRequestPackageInstalls()) {
                        Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                        permIntent.setData(Uri.parse("package:" + context.getPackageName()));
                        permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(permIntent);
                    }
                }

                Uri apkUri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(installIntent);

                JSObject res = new JSObject();
                res.put("state", "install_launched");
                res.put("apkPath", apkFile.getAbsolutePath());
                res.put("fileSize", apkFile.length());
                call.resolve(res);
            } catch (Exception ex) {
                JSObject res = new JSObject();
                res.put("state", "error");
                res.put("error", ex.getMessage());
                call.resolve(res);
            }
        });
    }
}
`

const autoMonevReceiverJava = `package id.go.kemnaker.maganghub.reminder;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AutoMonevReceiver extends BroadcastReceiver {

    static final String ACTION_AUTO_FILL = "id.go.kemnaker.maganghub.reminder.ACTION_AUTO_FILL_MONEV";
    private static final String CHANNEL_ID = "monev_voice_alarm_v1";
    private static final int REQUEST_CODE = 2300;
    private static final int NOTIF_ID = 2301;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(final Context context, final Intent intent) {
        final String action = intent != null ? intent.getAction() : "";
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            scheduleNext(context);
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(
            MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
        );
        if (!prefs.getBoolean("auto_fill_enabled", true)) {
            return;
        }

        final String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        if (todayStr.equals(prefs.getString("last_submitted_date", ""))) {
            scheduleNext(context);
            return;
        }
        if (todayStr.equals(prefs.getString("holiday_override_date", ""))) {
            scheduleNext(context);
            return;
        }
        String workDaysCsv = prefs.getString("work_days_csv", "1,2,3,4,5");
        int calDay = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
        int isoDay = (calDay == Calendar.SUNDAY) ? 7 : (calDay - 1);
        if (!isIsoDayEnabled(workDaysCsv, isoDay)) {
            scheduleNext(context);
            return;
        }

        final int hour = prefs.getInt("auto_fill_hour", 23);
        final int minute = prefs.getInt("auto_fill_minute", 0);
        final String timeLabel = String.format(Locale.US, "%02d:%02d", hour, minute);

        final PendingResult pendingResult = goAsync();
        EXECUTOR.execute(() -> {
            try {
                MonevApiHelper.AutoFillResult res = MonevApiHelper.executeAutoFillToday(
                    context, "", todayStr, "", "", ""
                );
                if ("submitted".equals(res.state)) {
                    postNotification(
                        context,
                        "Auto-Isi Monev " + timeLabel + " Berhasil",
                        res.message
                    );
                } else if ("session_expired".equals(res.state)) {
                    postNotification(
                        context,
                        "Auto-Isi Monev " + timeLabel + " Gagal (Sesi Habis)",
                        "Login ulang ke MagangHub agar pengisian otomatis aktif kembali."
                    );
                } else if ("no_previous_log".equals(res.state)) {
                    postNotification(
                        context,
                        "Auto-Isi Monev " + timeLabel + " Dilewati",
                        "Belum ada catatan kegiatan sebelumnya untuk disalin otomatis."
                    );
                }
            } finally {
                scheduleNext(context);
                pendingResult.finish();
            }
        });
    }

    static void scheduleNext(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(
            MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
        );
        if (!prefs.getBoolean("auto_fill_enabled", true)) {
            cancelAlarm(context);
            return;
        }

        int hour = prefs.getInt("auto_fill_hour", 23);
        int minute = prefs.getInt("auto_fill_minute", 0);

        Calendar target = Calendar.getInstance();
        target.set(Calendar.HOUR_OF_DAY, hour);
        target.set(Calendar.MINUTE, minute);
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        if (target.getTimeInMillis() <= System.currentTimeMillis() + 5000L) {
            target.add(Calendar.DAY_OF_MONTH, 1);
        }

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        PendingIntent pi = buildPendingIntent(context);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, target.getTimeInMillis(), pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, target.getTimeInMillis(), pi);
            }
        } catch (SecurityException ex) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, target.getTimeInMillis(), pi);
        }
    }

    static void cancelAlarm(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.cancel(buildPendingIntent(context));
        }
    }

    private static boolean isIsoDayEnabled(String csv, int isoDay) {
        if (csv == null || csv.trim().isEmpty()) {
            return isoDay >= 1 && isoDay <= 5;
        }
        String target = String.valueOf(isoDay);
        String[] parts = csv.split(",");
        for (String part : parts) {
            if (target.equals(part.trim())) {
                return true;
            }
        }
        return false;
    }

    private static PendingIntent buildPendingIntent(Context context) {
        Intent intent = new Intent(context, AutoMonevReceiver.class);
        intent.setAction(ACTION_AUTO_FILL);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }

    private static void postNotification(Context context, String title, String body) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            int rawSoundRes = context.getResources().getIdentifier(
                "reminder_sound", "raw", context.getPackageName()
            );
            Uri soundUri = rawSoundRes != 0
                ? Uri.parse("android.resource://" + context.getPackageName() + "/" + rawSoundRes)
                : null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Pengingat Suara Monev",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Notifikasi suara pengingat dan auto-isi Monev MagangHub");
                channel.enableVibration(true);
                if (soundUri != null) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                    channel.setSound(soundUri, attrs);
                }
                nm.createNotificationChannel(channel);
            }

            int smallIcon = context.getResources().getIdentifier(
                "ic_stat_alarm", "drawable", context.getPackageName()
            );
            if (smallIcon == 0) {
                smallIcon = android.R.drawable.ic_lock_idle_alarm;
            }

            Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent contentIntent = launchIntent != null
                ? PendingIntent.getActivity(
                    context,
                    NOTIF_ID,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                )
                : null;

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);

            if (soundUri != null) {
                builder.setSound(soundUri);
            }
            if (contentIntent != null) {
                builder.setContentIntent(contentIntent);
            }

            nm.notify(NOTIF_ID, builder.build());
        } catch (Exception ignored) {
            // Ignore notification permission / background restrictions
        }
    }
}
`

const alarmReceiverJava = `package id.go.kemnaker.maganghub.reminder;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public class AlarmReceiver extends BroadcastReceiver {

    public static final String ACTION_TRIGGER_MONEV_ALARM = "id.go.kemnaker.maganghub.reminder.ACTION_TRIGGER_MONEV_ALARM";
    public static final String ACTION_STOP_ALARM_SOUND = "id.go.kemnaker.maganghub.reminder.ACTION_STOP_ALARM_SOUND";
    private static final String CHANNEL_ID = "monev_voice_alarm_clock_v2";
    private static final int ALARM_REQUEST_CODE = 1700;
    private static final int NOTIF_ALARM_ID = 1701;

    private static MediaPlayer sMediaPlayer = null;
    private static PowerManager.WakeLock sWakeLock = null;
    private static final Handler sHandler = new Handler(Looper.getMainLooper());
    private static final Runnable sAutoStopRunnable = () -> stopRingingInternal();

    @Override
    public void onReceive(final Context context, final Intent intent) {
        final String action = intent != null ? intent.getAction() : "";

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            scheduleNextAlarmClock(context);
            return;
        }

        if (ACTION_STOP_ALARM_SOUND.equals(action)) {
            stopRinging(context);
            return;
        }

        if (ACTION_TRIGGER_MONEV_ALARM.equals(action)) {
            acquireWakeLock(context, 45000L);

            SharedPreferences prefs = context.getSharedPreferences(
                MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
            );

            String todayStr = getTodayDateString(prefs.getString("alarm_timezone", "Asia/Jakarta"));
            if (todayStr.equals(prefs.getString("last_submitted_date", ""))) {
                releaseWakeLock();
                scheduleNextAlarmClock(context);
                return;
            }
            if (prefs.getBoolean("today_filled", false)) {
                releaseWakeLock();
                scheduleNextAlarmClock(context);
                return;
            }

            if (todayStr.equals(prefs.getString("holiday_override_date", ""))) {
                releaseWakeLock();
                scheduleNextAlarmClock(context);
                return;
            }

            String workDaysCsv = prefs.getString("work_days_csv", "1,2,3,4,5");
            Calendar tzCal = Calendar.getInstance(TimeZone.getTimeZone(prefs.getString("alarm_timezone", "Asia/Jakarta")));
            int calDay = tzCal.get(Calendar.DAY_OF_WEEK);
            int isoDay = (calDay == Calendar.SUNDAY) ? 7 : (calDay - 1);
            if (!isIsoDayEnabled(workDaysCsv, isoDay)) {
                releaseWakeLock();
                scheduleNextAlarmClock(context);
                return;
            }

            String alarmTitle = intent.getStringExtra("alarm_title");
            if (alarmTitle == null || alarmTitle.isEmpty()) {
                alarmTitle = "Waktunya Isi Absen Monev!";
            }
            String alarmBody = "Jangan lupa isi monev! Absen Monev MagangHub hari ini belum diisi.";

            startAlarmSound(context);
            postAlarmNotification(context, alarmTitle, alarmBody);
            scheduleNextAlarmClock(context);
        }
    }

    private static synchronized void acquireWakeLock(Context context, long timeoutMs) {
        try {
            if (sWakeLock == null) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    sWakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "MagangHub:AlarmWakeLock"
                    );
                    sWakeLock.setReferenceCounted(false);
                }
            }
            if (sWakeLock != null && !sWakeLock.isHeld()) {
                sWakeLock.acquire(timeoutMs);
            }
        } catch (Exception ignored) {}
    }

    private static synchronized void releaseWakeLock() {
        try {
            if (sWakeLock != null && sWakeLock.isHeld()) {
                sWakeLock.release();
            }
        } catch (Exception ignored) {}
    }

    private static synchronized void startAlarmSound(Context context) {
        stopRingingInternal();
        try {
            int rawSoundRes = context.getResources().getIdentifier(
                "reminder_sound", "raw", context.getPackageName()
            );
            Uri soundUri = rawSoundRes != 0
                ? Uri.parse("android.resource://" + context.getPackageName() + "/" + rawSoundRes)
                : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);

            sMediaPlayer = new MediaPlayer();
            sMediaPlayer.setDataSource(context, soundUri);
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            sMediaPlayer.setAudioAttributes(attrs);
            sMediaPlayer.setLooping(true);
            sMediaPlayer.prepare();
            sMediaPlayer.start();

            sHandler.removeCallbacks(sAutoStopRunnable);
            sHandler.postDelayed(sAutoStopRunnable, 45000L);
        } catch (Exception ex) {
            try {
                Uri fallbackUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                sMediaPlayer = MediaPlayer.create(context, fallbackUri);
                if (sMediaPlayer != null) {
                    sMediaPlayer.start();
                }
            } catch (Exception ignored) {}
        }
    }

    public static synchronized void stopRinging(Context context) {
        stopRingingInternal();
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIF_ALARM_ID);
            }
        } catch (Exception ignored) {}
    }

    private static synchronized void stopRingingInternal() {
        sHandler.removeCallbacks(sAutoStopRunnable);
        try {
            if (sMediaPlayer != null) {
                if (sMediaPlayer.isPlaying()) {
                    sMediaPlayer.stop();
                }
                sMediaPlayer.reset();
                sMediaPlayer.release();
                sMediaPlayer = null;
            }
        } catch (Exception ignored) {}
        releaseWakeLock();
    }

    private static void postAlarmNotification(Context context, String title, String body) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            int rawSoundRes = context.getResources().getIdentifier(
                "reminder_sound", "raw", context.getPackageName()
            );
            Uri soundUri = rawSoundRes != 0
                ? Uri.parse("android.resource://" + context.getPackageName() + "/" + rawSoundRes)
                : null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Alarm Pengingat Monev (Layar Terkunci)",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Pengingat suara dan layar terkunci untuk pengisian Monev MagangHub");
                channel.enableVibration(true);
                channel.setBypassDnd(true);
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
                if (soundUri != null) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                    channel.setSound(soundUri, attrs);
                }
                nm.createNotificationChannel(channel);
            }

            int smallIcon = context.getResources().getIdentifier(
                "ic_stat_alarm", "drawable", context.getPackageName()
            );
            if (smallIcon == 0) {
                smallIcon = android.R.drawable.ic_lock_idle_alarm;
            }

            Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (openIntent != null) {
                openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                openIntent.putExtra("from_alarm", true);
            }
            PendingIntent openPendingIntent = openIntent != null
                ? PendingIntent.getActivity(
                    context,
                    NOTIF_ALARM_ID,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                )
                : null;

            Intent stopIntent = new Intent(context, AlarmReceiver.class);
            stopIntent.setAction(ACTION_STOP_ALARM_SOUND);
            PendingIntent stopPendingIntent = PendingIntent.getBroadcast(
                context,
                NOTIF_ALARM_ID + 1,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setOngoing(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Matikan Alarm", stopPendingIntent)
                .addAction(android.R.drawable.ic_menu_edit, "Isi Monev", openPendingIntent);

            if (openPendingIntent != null) {
                builder.setContentIntent(openPendingIntent);
                builder.setFullScreenIntent(openPendingIntent, true);
            }

            nm.notify(NOTIF_ALARM_ID, builder.build());
        } catch (Exception ignored) {}
    }

    public static void scheduleNextAlarmClock(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(
            MonevApiHelper.PREFS_NAME, Context.MODE_PRIVATE
        );

        String alarmsJson = prefs.getString("alarms_config", "");
        if (alarmsJson.isEmpty()) {
            cancelAlarmClock(context);
            return;
        }

        String tzStr = prefs.getString("alarm_timezone", "Asia/Jakarta");
        TimeZone tz = TimeZone.getTimeZone(tzStr);
        String workDaysCsv = prefs.getString("work_days_csv", "1,2,3,4,5");
        String holidayOverrideDate = prefs.getString("holiday_override_date", "");
        boolean todayFilled = prefs.getBoolean("today_filled", false);
        boolean snoozeEnabled = prefs.getBoolean("snooze_enabled", true);

        long nowMillis = System.currentTimeMillis();
        long earliestTrigger = Long.MAX_VALUE;
        String nextTitle = "Pengingat Monev MagangHub";
        String nextTime = "";
        String nextId = "";

        try {
            JSONArray alarmsArr = new JSONArray(alarmsJson);
            SimpleDateFormat dayFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            dayFormat.setTimeZone(tz);

            for (int dayOffset = 0; dayOffset < 7; dayOffset++) {
                Calendar dayCal = Calendar.getInstance(tz);
                dayCal.setTimeInMillis(nowMillis);
                dayCal.add(Calendar.DAY_OF_MONTH, dayOffset);
                String dateKey = dayFormat.format(dayCal.getTime());

                if (dateKey.equals(holidayOverrideDate)) {
                    continue;
                }

                if (dayOffset == 0 && (todayFilled || dateKey.equals(prefs.getString("last_submitted_date", "")))) {
                    continue;
                }

                int calDay = dayCal.get(Calendar.DAY_OF_WEEK);
                int isoDay = (calDay == Calendar.SUNDAY) ? 7 : (calDay - 1);
                if (!isIsoDayEnabled(workDaysCsv, isoDay)) {
                    continue;
                }

                for (int i = 0; i < alarmsArr.length(); i++) {
                    JSONObject obj = alarmsArr.getJSONObject(i);
                    boolean enabled = obj.optBoolean("enabled", true);
                    if (!enabled) continue;

                    String kind = obj.optString("kind", "primary");
                    if ("snooze".equals(kind) && !snoozeEnabled) continue;

                    String timeStr = obj.optString("time", "17:00");
                    String[] parts = timeStr.split(":");
                    int hour = parts.length > 0 ? Integer.parseInt(parts[0]) : 17;
                    int minute = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;

                    Calendar triggerCal = Calendar.getInstance(tz);
                    triggerCal.setTimeInMillis(dayCal.getTimeInMillis());
                    triggerCal.set(Calendar.HOUR_OF_DAY, hour);
                    triggerCal.set(Calendar.MINUTE, minute);
                    triggerCal.set(Calendar.SECOND, 0);
                    triggerCal.set(Calendar.MILLISECOND, 0);

                    long triggerMillis = triggerCal.getTimeInMillis();
                    if (triggerMillis > nowMillis + 5000L && triggerMillis < earliestTrigger) {
                        earliestTrigger = triggerMillis;
                        nextTitle = obj.optString("title", "Pengingat Monev MagangHub");
                        nextTime = timeStr;
                        nextId = obj.optString("id", "");
                    }
                }
            }

            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            if (earliestTrigger < Long.MAX_VALUE) {
                Intent showIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                PendingIntent showPi = showIntent != null
                    ? PendingIntent.getActivity(
                        context,
                        1702,
                        showIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                    )
                    : null;

                AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(earliestTrigger, showPi);

                Intent alarmIntent = new Intent(context, AlarmReceiver.class);
                alarmIntent.setAction(ACTION_TRIGGER_MONEV_ALARM);
                alarmIntent.putExtra("alarm_id", nextId);
                alarmIntent.putExtra("alarm_title", nextTitle);
                alarmIntent.putExtra("alarm_time", nextTime);

                PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    ALARM_REQUEST_CODE,
                    alarmIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                );

                am.setAlarmClock(clockInfo, pi);
            } else {
                cancelAlarmClock(context);
            }
        } catch (Exception ignored) {}
    }

    public static void cancelAlarmClock(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                Intent alarmIntent = new Intent(context, AlarmReceiver.class);
                alarmIntent.setAction(ACTION_TRIGGER_MONEV_ALARM);
                PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    ALARM_REQUEST_CODE,
                    alarmIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                );
                am.cancel(pi);
            }
        } catch (Exception ignored) {}
    }

    private static String getTodayDateString(String tzStr) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone(tzStr));
        return sdf.format(new Date());
    }

    private static boolean isIsoDayEnabled(String csv, int isoDay) {
        if (csv == null || csv.trim().isEmpty()) {
            return isoDay >= 1 && isoDay <= 5;
        }
        String target = String.valueOf(isoDay);
        String[] parts = csv.split(",");
        for (String part : parts) {
            if (target.equals(part.trim())) {
                return true;
            }
        }
        return false;
    }
}
`

writeFileSync(resolve(javaPkgDir, 'MonevApiHelper.java'), monevApiHelperJava, 'utf-8')
writeFileSync(resolve(javaPkgDir, 'MonevSyncPlugin.java'), monevSyncJava, 'utf-8')
writeFileSync(resolve(javaPkgDir, 'AutoMonevReceiver.java'), autoMonevReceiverJava, 'utf-8')
writeFileSync(resolve(javaPkgDir, 'AlarmReceiver.java'), alarmReceiverJava, 'utf-8')
console.log('Generated MonevApiHelper.java, MonevSyncPlugin.java, AutoMonevReceiver.java, AlarmReceiver.java')

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
        AlarmReceiver.stopRinging(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        AlarmReceiver.stopRinging(this);
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

// 4b. Copy custom notification sound ("Jangan lupa isi monev!") into res/raw/
const resDir = resolve(root, 'android/app/src/main/res')
const customSoundSrc = resolve(root, 'resources/android/raw/reminder_sound.mp3')
if (existsSync(customSoundSrc)) {
  const rawDir = resolve(resDir, 'raw')
  mkdirSync(rawDir, { recursive: true })
  copyFileSync(customSoundSrc, resolve(rawDir, 'reminder_sound.mp3'))
  console.log('Copied custom notification audio to res/raw/reminder_sound.mp3')
}

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

// 5b. Sync Android versionName & versionCode from APP_VERSION env or package.json
const appGradlePath = resolve(root, 'android/app/build.gradle')
if (existsSync(appGradlePath)) {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
  const rawVer = (process.env.APP_VERSION || pkg.version || '1.0.0').replace(/^v/, '')
  const [maj = 1, min = 0, pat = 0] = rawVer
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  const versionCode = maj * 10000 + min * 100 + pat
  let appGradle = readFileSync(appGradlePath, 'utf-8')
  appGradle = appGradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  appGradle = appGradle.replace(/versionName\s+"[^"]*"/, `versionName "${rawVer}"`)

  // 5c. Copy persistent release keystore & configure identical signing for in-place APK updates
  const keystoreSrc = resolve(root, 'resources/android/signing/release.keystore')
  const keystoreDst = resolve(root, 'android/app/release.keystore')
  if (existsSync(keystoreSrc)) {
    copyFileSync(keystoreSrc, keystoreDst)
    console.log('Copied persistent release keystore to android/app/release.keystore')
  }

  if (!appGradle.includes('signingConfigs {')) {
    const signingBlock = `
    signingConfigs {
        release {
            storeFile file('release.keystore')
            storePassword 'monevmaganghub'
            keyAlias 'maganghub'
            keyPassword 'monevmaganghub'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.release
        }
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
`
    appGradle = appGradle.replace(
      /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?\}\s*\}/,
      signingBlock.trim()
    )
    console.log('Injected persistent release signingConfigs to android/app/build.gradle')
  }

  writeFileSync(appGradlePath, appGradle, 'utf-8')
  console.log(`Updated Android versionName="${rawVer}" (versionCode=${versionCode})`)
}

// 6. Replace default Capacitor launcher icons & splash with custom MagangHub Reminder branding
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
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0267FF</color>\n</resources>\n`,
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
