package com.bellcraft.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * BellRingerService — ForegroundService that plays the bell sound.
 *
 * Uses AudioAttributes.USAGE_ALARM so the sound plays:
 *   • When the app is closed
 *   • When the screen is locked
 *   • Even in Silent / Do-Not-Disturb mode (alarm stream bypasses these)
 *   • On all OEM devices (Samsung, Xiaomi, Huawei, Oppo …)
 *
 * Subject guard (Layer 3 of 3 — Service side):
 *   subjectId == 0 → empty period, stop immediately without playing.
 *   subjectId  < 0 → absent (special/duty alarm) → always play.
 *   subjectId  > 0 → real class scheduled → play normally.
 */
public class BellRingerService extends Service {

    private static final String CHANNEL_ID = "bellcraft-ringing";
    private static final int NOTIF_ID       = 9901;

    private MediaPlayer mediaPlayer;
    private final Handler handler = new Handler(Looper.getMainLooper());

    // ── Lifecycle ─────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // ── Subject guard (Layer 3 of 3) ──────────────────────────────────
        // BellAlarmReceiver should have blocked subjectId==0 already, but we
        // repeat the check here in case the service is started by another path.
        // Default -1 = field absent → always ring (special / duty alarms).
        int subjectId = intent != null ? intent.getIntExtra("subjectId", -1) : -1;
        if (subjectId == 0) {
            // Empty / free period — must not ring. Call startForeground first
            // (Android 12+ requires it within 5 s even if we stop immediately),
            // then stop ourselves.
            startForeground(NOTIF_ID, buildNotification("بيل كرافت"));
            stopSelf();
            return START_NOT_STICKY;
        }

        String label      = intent != null ? intent.getStringExtra("label")            : null;
        float  volume     = intent != null ? intent.getFloatExtra("volume",      1.0f) : 1.0f;
        int    durSec     = intent != null ? intent.getIntExtra("durationSec",      6) : 6;
        int    repeat     = intent != null ? intent.getIntExtra("repeatCount",      1) : 1;
        String soundFile  = intent != null ? intent.getStringExtra("soundFile")        : null;

        // Must call startForeground quickly (within 5 s on Android 12+)
        startForeground(NOTIF_ID, buildNotification(label != null ? label : "جرس الحصة 🔔"));

        playBell(volume, durSec, repeat, soundFile);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        releasePlayer();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    // ── Audio ─────────────────────────────────────────────────────────────

    /**
     * Map the soundFile name (set by toNativeSoundFile() in JS) to an
     * Android res/raw resource ID.
     *
     * All cases must match the keys produced by toNativeSoundFile():
     *   classic_bell  ← 'classic' (default)
     *   chime         ← 'chime'
     *   neptune       ← 'gentle'
     *   musical_bell  ← 'musical'
     *   alarm_bell    ← 'alarm'
     *   school_bell   ← 'school_bell'  (WAV — high-quality school bell)
     */
    private int getSoundResource(String soundFile) {
        if (soundFile == null) return R.raw.classic_bell;
        switch (soundFile) {
            case "chime":        return R.raw.chime;
            case "neptune":      return R.raw.neptune;
            case "musical_bell": return R.raw.musical_bell;
            case "alarm_bell":   return R.raw.alarm_bell;
            case "school_bell":  return R.raw.school_bell;
            default:             return R.raw.classic_bell;
        }
    }

    private void playBell(float volume, int durSec, int repeatCount, String soundFile) {
        try {
            releasePlayer();

            // Build AudioAttributes with USAGE_ALARM BEFORE calling prepare().
            // MediaPlayer.create() calls prepare() internally, so any
            // setAudioAttributes() call after create() arrives too late on some
            // OEM builds (Samsung, Xiaomi) — the audio ends up on the MEDIA stream
            // and gets silenced by the ringer switch.  Manual init fixes this.
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(attrs);   // ← must be before prepare()

            AssetFileDescriptor afd =
                    getResources().openRawResourceFd(getSoundResource(soundFile));
            if (afd == null) { stopSelf(); return; }
            mediaPlayer.setDataSource(
                    afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();

            mediaPlayer.prepare();                   // ← after setAudioAttributes()
            mediaPlayer.setVolume(volume, volume);

            final int[] left = { repeatCount };

            mediaPlayer.setOnCompletionListener(mp -> {
                left[0]--;
                if (left[0] > 0) {
                    mp.seekTo(0);
                    mp.start();
                } else {
                    stopSelf();
                }
            });

            mediaPlayer.start();

            // Safety timeout: stop even if completion listener never fires
            long safetyMs = ((long) durSec * repeatCount + 3) * 1000L;
            handler.postDelayed(this::stopSelf, safetyMs);

        } catch (Exception e) {
            stopSelf();
        }
    }

    private void releasePlayer() {
        if (mediaPlayer != null) {
            try { if (mediaPlayer.isPlaying()) mediaPlayer.stop(); } catch (Exception ignored) {}
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    // ── Notification (required for ForegroundService) ─────────────────────

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "رنين الجرس", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("يعمل فقط أثناء رنين الجرس");
        ch.setSound(null, null);   // audio handled by MediaPlayer, not notification
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String label) {
        Intent tap = new Intent(this, MainActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(this, 0, tap, piFlags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(this, CHANNEL_ID);
        } else {
            b = new Notification.Builder(this);
        }

        return b.setContentTitle(label)
                .setContentText("بيل كرافت — جرس الحصة")
                .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }
}
