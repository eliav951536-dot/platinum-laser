// notify.js — מריץ כל בוקר ב-9:00 דרך Windows Task Scheduler
// קורא לקוחות מ-GitHub, שולח WhatsApp דרך הבוט המקומי

import { GH_TOKEN } from './notify.config.js';

const BOT_URL   = 'http://127.0.0.1:7654';
const OWNER_JID = '972539630443@s.whatsapp.net';
const GH_OWNER  = 'eliav951536-dot';
const GH_REPO   = 'platinum-laser-data';
const APP_URL   = 'https://eliav951536-dot.github.io/platinum-laser/';
const DAYS      = 40;

function daysSince(d) {
    if (!d) return null;
    const a = new Date(d), b = new Date();
    a.setHours(0,0,0,0); b.setHours(0,0,0,0);
    return Math.floor((b - a) / 86400000);
}

async function getCustomers() {
    const res = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/customers.json`,
        { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github.raw+json' } }
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return res.json();
}

async function main() {
    const customers = await getCustomers();

    const overdue = customers
        .filter(c => { const d = daysSince(c.lastTreatment); return d !== null && d >= DAYS; })
        .sort((a, b) => daysSince(b.lastTreatment) - daysSince(a.lastTreatment));

    if (overdue.length === 0) {
        console.log('✅ אין לקוחות שצריכים הודעה היום');
        return;
    }

    const date = new Date().toLocaleDateString('he-IL', { day:'numeric', month:'numeric', year:'numeric' });
    let msg = `🔔 *PLATINUM LASER — ${date}*\n`;
    msg += `יש *${overdue.length}* לקוחות שצריכים הודעה:\n\n`;

    overdue.forEach(c => {
        const days = daysSince(c.lastTreatment);
        const phone = c.phone ? ` | 0${String(c.phone).replace(/^972/,'')}` : '';
        const area  = c.area  ? ` | ${c.area}` : '';
        msg += `• *${c.name}* — ${days} ימים${area}${phone}\n`;
    });

    msg += `\n📱 ${APP_URL}`;
    msg += `\n\n_הודעה ללקוחות כוללת קישור לקביעת תור: https://calmark.io/p/VTqTx_`;

    const res = await fetch(`${BOT_URL}/group/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: OWNER_JID, text: msg })
    });

    if (!res.ok) throw new Error(`Bot ${res.status}: ${await res.text()}`);
    console.log(`✅ WhatsApp נשלח — ${overdue.length} לקוחות`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
