(function (root) {
  'use strict';
  // The gift anniversary follows Spain's midnight, even if a device keeps another time zone.
  // UTC is used only to count calendar dates, so DST cannot shift the day count.
  const formatter = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Madrid',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'});
  function anniversaryClock(now) {
    const parts = Object.fromEntries(formatter.formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type,Number(part.value)]));
    const year = parts.year, month = parts.month - 1, day = parts.day;
    const ordinal = (y, m, d) => Date.UTC(y, m, d) / 86400000;
    const startDay = ordinal(2020, 8, 19);
    const totalDays = Math.max(0, ordinal(year, month, day) - startDay);
    let wholeMonths = (year - 2020) * 12 + month - 8;
    if (day < 19) wholeMonths--;
    wholeMonths = Math.max(0, wholeMonths);
    const anchorYear = 2020 + Math.floor((8 + wholeMonths) / 12);
    const anchorMonth = (8 + wholeMonths) % 12;
    return {
      totalDays,
      years: Math.floor(wholeMonths / 12),
      months: wholeMonths % 12,
      days: Math.max(0, ordinal(year, month, day) - ordinal(anchorYear, anchorMonth, 19)),
      hours: parts.hour, minutes: parts.minute, seconds: parts.second
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = { anniversaryClock };
  else root.anniversaryClock = anniversaryClock;
})(typeof window === 'object' ? window : globalThis);
