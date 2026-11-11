import React from 'react';

// Dependency-free Code 39 barcode (letters A-Z, digits, "-" and "."), enough for VAL-OSCA-2026-000001.
// Each char = 9 elements (bar,space,...) of which 3 are wide. Pattern: n = narrow, w = wide.
const P = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn',
  '6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn','A':'wnnnnwnnw','B':'nnwnnwnnw',
  'C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn',
  'I':'nnwnnwwnn','J':'nnnnwwwnn','K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww',
  'O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn',
  '-':'nwnnnnwnw','.':'wwnnnnwnn','*':'nwnnwnwnn',
};

export default function Code39({ value, height = 44, narrow = 1.6 }) {
  const text = `*${String(value).toUpperCase()}*`;
  const bars = [];
  let x = 0;
  for (const ch of text) {
    const pat = P[ch];
    if (!pat) continue;
    for (let i = 0; i < 9; i++) {
      const w = (pat[i] === 'w' ? 3 : 1) * narrow;
      if (i % 2 === 0) bars.push(<rect key={`${x}`} x={x} y={0} width={w} height={height} fill="#000" />);
      x += w;
    }
    x += narrow; // inter-character gap
  }
  return (
    <svg viewBox={`0 0 ${x} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={`Barcode ${value}`}>
      {bars}
    </svg>
  );
}
