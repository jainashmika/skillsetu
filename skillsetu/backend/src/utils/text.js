const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'item';
const STOP = new Set('a an the and or of to in for on with at by from as is are be this that we you our your will can job role work candidate candidates experience years year looking required requirements responsibilities who have has should must'.split(' '));
const tokenize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+#.ऀ-ॿಀ-೿\s]/g, ' ').split(/\s+/).map((t) => t.replace(/^\.+|\.+$/g, '')).filter((t) => t.length > 1 && !STOP.has(t));
const inr = (n) => (n == null ? null : `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)} LPA`);
module.exports = { slugify, tokenize, inr };
