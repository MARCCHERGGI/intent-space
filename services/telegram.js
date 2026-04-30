// Telegram broadcast — fires on synthesis convergences. Optional, fail-soft.
// Configure via env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (or @channelhandle).

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT  = process.env.TELEGRAM_CHAT_ID; // numeric id or @channelhandle

export const enabled = !!(TOKEN && CHAT);

export async function send(text) {
  if (!enabled) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function broadcastSynthesis({ signalText, insight, action, observatoryUrl }) {
  if (!enabled) return false;
  const lines = [
    `<b>◎ Council converged</b>`,
    ``,
    `<i>signal</i> — ${escape(signalText)}`,
    ``,
    `<b>insight:</b> ${escape(insight)}`,
    `<b>action:</b> ${escape(action)}`,
  ];
  if (observatoryUrl) lines.push('', `<a href="${observatoryUrl}">↗ watch on spacebase1</a>`);
  return send(lines.join('\n'));
}

export async function broadcastSignal({ signalText }) {
  if (!enabled) return false;
  return send(`<b>⊛ new signal</b>\n${escape(signalText)}`);
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
