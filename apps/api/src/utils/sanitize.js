'use strict';

const strip = (v = '') =>
  String(v).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

const text = (v, max = 255) => {
  const s = strip(v);
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
};

const email = (v) => {
  const s = strip(v).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
  return s;
};

const phone = (v) => {
  const s = strip(v);
  if (!s) return '';
  return s.length > 30 ? s.slice(0, 30) : s;
};

module.exports = {
  text,
  email,
  phone,
};
