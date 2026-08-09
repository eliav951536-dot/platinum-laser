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

function tomorrowStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function phoneClean(p) {
    if (!p) return '';
    let n = String(p).replace(/\D/g, '');
    if (n.length === 9) n = '0' + n;
    return n.replace(/^0/, '972');
}

function fillTemplate(tpl, a) {
    return (tpl || '')
        .replaceAll('{שם}', a.name)
        .replaceAll('{תאריך}', a.date || '')
        .replaceAll('{שעה}', a.time || '')
        .replaceAll('{אזור}', a.area || '');
}

async function getData() {
    const res = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/customers.json`,
        { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github.raw+json' } }
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const j = await res.json();
    return Array.isArray(j) ? { customers: j, appointments: [], settings: {} } : j;
}

async function main() {
    const state = await getData();
    const customers = state.customers || [];
    const appts = state.appointments || [];

    const overdue = customers
        .filter(c => !c.paused)
        .filter(c => { const d = daysSince(c.lastTreatment); return d !== null && d >= DAYS; })
        .sort((a, b) => daysSince(b.lastTreatment) - daysSince(a.lastTreatment));

    const tmrw = tomorrowStr();
    const apptTomorrow = appts
        .filter(a => a.date === tmrw)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    if (overdue.length === 0 && apptTomorrow.length === 0) {
        console.log('✅ אין מה לשלוח היום');
        return;
    }

    const date = new Date().toLocaleDateString('he-IL', { day:'numeric', month:'numeric', year:'numeric' });
    let msg = `🔔 *PLATINUM LASER — ${date}*\n`;

    if (overdue.length) {
        msg += `\nיש *${overdue.length}* לקוחות שצריכים הודעה:\n\n`;
        overdue.forEach(c => {
            const days = daysSince(c.lastTreatment);
            const phone = c.phone ? ` | 0${String(c.phone).replace(/^972/,'')}` : '';
            const area  = c.area  ? ` | ${c.area}` : '';
            const tag   = c.callsOnly ? ' 📞' : '';
            msg += `• *${c.name}*${tag} — ${days} ימים${area}${phone}\n`;
        });
    }

    if (apptTomorrow.length) {
        msg += `\n📅 *תורים למחר (${apptTomorrow.length}):*\n\n`;
        apptTomorrow.forEach(a => {
            const phone = a.phone ? ` | 0${String(a.phone).replace(/^972/,'')}` : '';
            const area  = a.area  ? ` | ${a.area}` : '';
            msg += `• *${a.name}* — ${a.time || ''}${area}${phone}\n`;
            if (a.phone && state.settings?.reminderTemplate) {
                const text = fillTemplate(state.settings.reminderTemplate, a);
                msg += `  ↳ https://wa.me/${phoneClean(a.phone)}?text=${encodeURIComponent(text)}\n`;
            }
        });
    }

    msg += `\n📱 ${APP_URL}`;
    if (overdue.length) msg += `\n\n_הודעה ללקוחות כוללת קישור לקביעת תור: https://calmark.io/p/VTqTx_`;

    const res = await fetch(`${BOT_URL}/group/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: OWNER_JID, text: msg })
    });

    if (!res.ok) throw new Error(`Bot ${res.status}: ${await res.text()}`);
    console.log(`✅ WhatsApp נשלח — ${overdue.length} לקוחות`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
