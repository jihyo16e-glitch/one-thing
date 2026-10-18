// The One Thing mascot: a teal seed with one leaf. The owner's own art (2026-10-18,
// brand/mascot-moods-source.jpg), redrawn in SVG; shape and colours were measured from his picture.
// Approved on the test page brand/mascot-moods.html. Motion lives in styles.css ("Mascot" block) and
// is off under reduced motion. The app icons (scripts/make-icons.py) use the same paths.

export type Mood = 'idle' | 'wave' | 'look' | 'sleepy' | 'focus' | 'happy' | 'think';

const BODY = 'M120 69C160 69 200 115 200 160C200 200 170 222 120 222C70 222 40 200 40 160C40 115 80 69 120 69Z';
const STAR = 'M0 -11C1.2 -2.4 2.4 -1.2 11 0C2.4 1.2 1.2 2.4 0 11C-1.2 2.4 -2.4 1.2 -11 0C-2.4 -1.2 -1.2 -2.4 0 -11Z';
// x, y, scale, mint: the sparkles of the Done jump
const SPARKS: [number, number, number, boolean][] = [
  [30, 72, 1, false], [214, 50, 1.25, false], [226, 150, 0.8, true],
  [16, 168, 0.9, true], [204, 206, 0.6, false], [44, 30, 0.55, false],
];

function Eyes({ mood }: { mood: Mood }) {
  if (mood === 'sleepy' || mood === 'focus') {
    return (
      <>
        <path className="lid" d="M86 140Q97 150 108 140" />
        <path className="lid" d="M132 140Q143 150 154 140" />
      </>
    );
  }
  if (mood === 'happy') {
    return (
      <>
        <path className="lid" d="M86 146Q97 134 108 146" />
        <path className="lid" d="M132 146Q143 134 154 146" />
      </>
    );
  }
  if (mood === 'look' || mood === 'think') {
    return (
      <>
        <circle className="white" cx="97" cy="139" r="14" />
        <circle className="white" cx="143" cy="139" r="14" />
        <g className="pupil">
          <circle className="ink" cx="97" cy="139" r="8" />
          <circle className="ink" cx="143" cy="139" r="8" />
          <circle className="shine" cx="99.8" cy="136" r="2.6" />
          <circle className="shine" cx="145.8" cy="136" r="2.6" />
        </g>
      </>
    );
  }
  return (
    <>
      <g className="eye">
        <rect className="ink" x="90.1" y="125" width="16.2" height="29.7" rx="8.1" />
        <circle className="shine" cx="101.2" cy="132" r="3" />
      </g>
      <g className="eye">
        <rect className="ink" x="133.7" y="125" width="16.2" height="29.7" rx="8.1" />
        <circle className="shine" cx="144.8" cy="132" r="3" />
      </g>
    </>
  );
}

/**
 * `pad` adds room around the 240 x 240 drawing (the leaf touches the top). `still` stops the motion.
 * With a `label` the mascot is announced as an image; without one it is decoration.
 */
export function Mascot({ mood, size, label, pad = 0, still = false }: { mood: Mood; size: number; label?: string; pad?: number; still?: boolean }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <svg
      {...a11y}
      className={'seed m-' + mood + (still ? ' seed-still' : '')}
      width={size}
      height={size}
      viewBox={-pad + ' ' + -pad + ' ' + (240 + 2 * pad) + ' ' + (240 + 2 * pad)}
    >
      {mood === 'focus' && <circle className="halo" cx="120" cy="148" r="98" />}
      <ellipse className="shadow" cx="120" cy="233" rx="56" ry="5.5" />
      <g className="bob">
        <g className="squash">
          <g className="leaf-g">
            <path className="stem" d="M118.6 74C118.4 63 120.6 54 125.6 48.6" />
            <path className="leaf" d="M123 51.3Q174.1 64.4 179.6 11.9Q131.9 3.7 123 51.3Z" />
            <path className="vein" d="M125.6 48.6C134 40 145 32.5 160 22.5" />
          </g>
          <path className="body" d={BODY} />
          {mood === 'wave' && <path className="hand" d="M186 172C192 160 200 146 207 138C213 131 222 134 220 143C218 150 210 160 200 176Z" />}
          <ellipse className="cheek" cx="83" cy="160.6" rx="10.4" ry="4.9" />
          <ellipse className="cheek" cx="157" cy="160.6" rx="10.4" ry="4.9" />
          <g className="face"><Eyes mood={mood} /></g>
        </g>
      </g>
      {mood === 'wave' && (
        <g className="waves">
          <path d="M224 120q9 5 11 15" />
          <path d="M233 108q12 7 14 22" />
        </g>
      )}
      {mood === 'sleepy' && (
        <>
          <g transform="translate(198 60)"><path className="moon" d="M-2.6 -14.8A15 15 0 1 0 14.2 4.8A13 13 0 0 1 -2.6 -14.8Z" /></g>
          <text className="zz z1" x="214" y="38">z</text>
          <text className="zz z2" x="214" y="38">z</text>
        </>
      )}
      {/* The place sits on the group: a CSS animation on the path itself would replace its transform. */}
      {mood === 'happy' && SPARKS.map(([x, y, s, mint], i) => (
        <g key={i} transform={'translate(' + x + ' ' + y + ') scale(' + s + ')'}>
          <path className={'spark' + (mint ? ' mint' : '')} style={{ animationDelay: i * 0.06 + 's' }} d={STAR} />
        </g>
      ))}
      {mood === 'think' && <text className="qm" x="188" y="52">?</text>}
    </svg>
  );
}
