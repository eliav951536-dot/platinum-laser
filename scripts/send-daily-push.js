// Runs daily via .github/workflows/daily-push.yml (GitHub Actions).
// Reads customers.json from the private platinum-laser-data repo, computes
// the same "overdue customers + tomorrow's appointments" count the app's
// own 🔔 reminders screen shows, and sends a Web Push notification to every
// device subscription stored in settings.pushSubscriptions.
import webpush from 'web-push';

const DAYS = 40;
const GH_OWNER = 'eliav951536-dot';
const GH_REPO = 'platinum-laser-data';
const APP_URL = 'https://eliav951536-dot.github.io/platinum-laser/';

const GH_DATA_TOKEN = process.env.GH_DATA_TOKEN;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails('mailto:eliav951536@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function daysSince(d) {
    if (!d) return null;
    const a = new Date(d), b = new Date();
    a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
    return Math.floor((b - a) / 86400000);
}

function tomorrowStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

async function readState() {
    const res = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/customers.json`,
        { headers: { Authorization: `Bearer ${GH_DATA_TOKEN}`, Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) throw new Error(`GitHub read ${res.status}`);
    const j = await res.json();
    const sha = j.sha;
    const state = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
    const normalized = Array.isArray(state) ? { customers: state, appointments: [], settings: {} } : state;
    return { state: normalized, sha };
}

async function writeState(state, sha) {
    const content = Buffer.from(JSON.stringify(state, null, 2), 'utf8').toString('base64');
    const res = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/customers.json`,
        {
            method: 'PUT',
            headers: { Authorization: `Bearer ${GH_DATA_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'prune dead push subscriptions', content, sha })
        }
    );
    if (!res.ok) throw new Error(`GitHub write ${res.status}: ${await res.text()}`);
}

async function main() {
    const { state, sha } = await readState();
    const customers = state.customers || [];
    const appts = state.appointments || [];
    const subs = state.settings?.pushSubscriptions || [];

    if (!subs.length) {
        console.log('אין subscriptions רשומים — אף מכשיר לא הפעיל התראות עדיין.');
        return;
    }

    const overdueCount = customers
        .filter(c => !c.paused)
        .filter(c => { const d = daysSince(c.lastTreatment); return d !== null && d >= DAYS; })
        .length;

    const tmrw = tomorrowStr();
    const apptTomorrowCount = appts.filter(a => a.date === tmrw).length;

    const total = overdueCount + apptTomorrowCount;
    if (total === 0) {
        console.log('✅ אין תזכורות לשליחה היום — לא נשלחה התראה.');
        return;
    }

    const parts = [];
    if (overdueCount) parts.push(`${overdueCount} לקוחות שצריכים הודעה`);
    if (apptTomorrowCount) parts.push(`${apptTomorrowCount} תורים למחר`);

    const payload = JSON.stringify({
        title: '🔔 PLATINUM LASER',
        body: `יש לך תזכורות היום: ${parts.join(' + ')}`,
        url: APP_URL
    });

    let deadEndpoints = [];
    for (const sub of subs) {
        try {
            await webpush.sendNotification(sub, payload);
            console.log('✅ נשלח ל-', sub.endpoint.slice(0, 60), '...');
        } catch (err) {
            console.error('❌ שליחה נכשלה:', err.statusCode, sub.endpoint.slice(0, 60));
            if (err.statusCode === 404 || err.statusCode === 410) deadEndpoints.push(sub.endpoint);
        }
    }

    if (deadEndpoints.length) {
        state.settings.pushSubscriptions = subs.filter(s => !deadEndpoints.includes(s.endpoint));
        await writeState(state, sha);
        console.log(`🧹 הוסרו ${deadEndpoints.length} subscriptions לא פעילים`);
    }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
