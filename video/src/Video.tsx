import React from 'react';
import {AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const C = {
  bg: '#0f1114', panel: '#1a1c20', ink: '#e9e7e1', muted: '#9c9a92', line: '#2b2e34',
  accent: '#5fd0a8', accentSoft: '#17302a', warn: '#e0a84e', term: '#0a0b0e', blue: '#6cb6ff',
};
const SANS = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const MONO = '"SF Mono", Menlo, Consolas, monospace';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.out(Easing.cubic);

const fade = (f: number, start: number, dur = 12) => interpolate(f, [start, start + dur], [0, 1], clamp);
const rise = (f: number, start: number, dur = 16, dist = 24) => interpolate(f, [start, start + dur], [dist, 0], {...clamp, easing: ease});

const Pop: React.FC<{start: number; children: React.ReactNode; style?: React.CSSProperties}> = ({start, children, style}) => {
  const f = useCurrentFrame();
  return <div style={{opacity: fade(f, start), transform: `translateY(${rise(f, start)}px)`, ...style}}>{children}</div>;
};

const Headline: React.FC<{children: React.ReactNode; size?: number; color?: string}> = ({children, size = 88, color = C.ink}) => (
  <div style={{fontFamily: SANS, fontWeight: 700, fontSize: size, lineHeight: 1.1, letterSpacing: -2, color, textAlign: 'center'}}>{children}</div>
);

// ---------- Scene 1: the problem ----------
const Scene1: React.FC = () => {
  const f = useCurrentFrame();
  const used = interpolate(f, [25, 60], [0, 40], {...clamp, easing: ease});
  const drain = interpolate(f, [115, 150], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
  const unused = (100 - used) * (1 - drain) - 0; // percent of bar still green
  const hours = Math.round(interpolate(f, [70, 150], [95, 0], clamp));
  const d = Math.floor(hours / 24), h = hours % 24;
  const turnAmber = interpolate(f, [100, 125], [0, 1], clamp);
  const barColor = turnAmber > 0.5 ? C.warn : C.accent;
  const caption = f < 70 ? 'You pay for Claude.' : f < 120 ? 'Every week, part of it sits unused.' : 'Then it expires.';
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 70}}>
      <Pop start={0}><Headline size={92}>{caption}</Headline></Pop>
      <div style={{width: 1400}}>
        <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 28, color: C.muted, marginBottom: 18, opacity: fade(f, 10)}}>
          <span>YOUR WEEKLY CLAUDE QUOTA</span>
          <span style={{color: f > 100 ? C.warn : C.muted}}>resets in {d}d {h}h</span>
        </div>
        <div style={{display: 'flex', height: 96, borderRadius: 20, background: C.panel, border: `2px solid ${C.line}`, overflow: 'hidden', opacity: fade(f, 8)}}>
          <div style={{width: `${used}%`, background: '#3b3f47'}} />
          <div style={{width: `${Math.max(unused, 0)}%`, background: barColor, boxShadow: `0 0 60px ${barColor}88`, opacity: 0.9 + 0.1 * Math.sin(f / 4)}} />
        </div>
        <div style={{display: 'flex', fontFamily: SANS, fontSize: 34, marginTop: 22, height: 50}}>
          <div style={{width: '40%', color: C.muted, opacity: fade(f, 55)}}>40% used</div>
          <div style={{color: f > 120 ? C.warn : C.accent, fontWeight: 600, opacity: fade(f, 62) * (1 - drain * 0.0)}}>
            {f > 135 ? 'wasted' : '60% unused'}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 2: the idea ----------
const Box: React.FC<{label: string; sub: string; color: string; icon: string}> = ({label, sub, color, icon}) => (
  <div style={{width: 520, padding: '34px 30px', borderRadius: 24, background: C.panel, border: `2px solid ${color}`, textAlign: 'center', boxShadow: `0 0 50px ${color}33`}}>
    <div style={{fontSize: 64}}>{icon}</div>
    <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 38, color: C.ink, marginTop: 6}}>{label}</div>
    <div style={{fontFamily: SANS, fontSize: 26, color: C.muted, marginTop: 6}}>{sub}</div>
  </div>
);

const Scene2: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f, fps, config: {damping: 14}});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 50}}>
      <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 150, color: C.accent, letterSpacing: -4, transform: `scale(${0.7 + 0.3 * s})`, opacity: fade(f, 0, 8)}}>Swarm</div>
      <Pop start={18}><Headline size={58} color={C.ink}>Spend the leftover on open-source projects <span style={{color: C.accent}}>you choose.</span></Headline></Pop>
      <div style={{display: 'flex', alignItems: 'center', gap: 0, marginTop: 20, opacity: fade(f, 40)}}>
        <Box label="Your leftover Claude" sub="would have expired" color={C.accent} icon="⚡" />
        <div style={{position: 'relative', width: 420, height: 8, background: C.line, margin: '0 10px', borderRadius: 4}}>
          {[0, 1, 2, 3, 4].map((i) => {
            const x = ((f * 5 + i * 84) % 420);
            return <div key={i} style={{position: 'absolute', left: x - 12, top: -10, width: 28, height: 28, borderRadius: 14, background: C.accent, boxShadow: `0 0 20px ${C.accent}`}} />;
          })}
        </div>
        <Box label="Pull request" sub="on a project you picked" color={C.blue} icon="🔀" />
      </div>
    </AbsoluteFill>
  );
};

// ---------- Scene 3: three steps ----------
const STEPS = ['Install the plugin', 'Pick a project', 'Leftover does the work'];

const Terminal: React.FC<{title: string; children: React.ReactNode}> = ({title, children}) => (
  <div style={{width: 1000, borderRadius: 22, background: C.term, border: `2px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 30px 80px #0008'}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', background: '#15171b', borderBottom: `1px solid ${C.line}`}}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{width: 16, height: 16, borderRadius: 8, background: c}} />)}
      <div style={{fontFamily: MONO, fontSize: 22, color: C.muted, marginLeft: 14}}>{title}</div>
    </div>
    <div style={{padding: '32px 36px', fontFamily: MONO, fontSize: 30, lineHeight: 1.7, color: '#d7dae0', minHeight: 420}}>{children}</div>
  </div>
);

const Typed: React.FC<{text: string; start: number; cps?: number}> = ({text, start, cps = 1.6}) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((f - start) * cps)));
  return <>{text.slice(0, n)}{n < text.length && f >= start ? <span style={{background: C.ink, color: C.ink}}>_</span> : null}</>;
};

const StepList: React.FC<{active: number}> = ({active}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 34, width: 640}}>
      {STEPS.map((t, i) => {
        const on = i === active;
        return (
          <div key={t} style={{display: 'flex', alignItems: 'center', gap: 28, opacity: on ? 1 : i < active ? 0.55 : 0.28, transform: `scale(${on ? 1 : 0.96})`, transformOrigin: 'left center'}}>
            <div style={{width: 84, height: 84, borderRadius: 42, background: on ? C.accent : i < active ? C.accentSoft : C.panel, color: on ? C.bg : C.accent, fontFamily: MONO, fontWeight: 700, fontSize: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${on || i < active ? C.accent : C.line}`}}>
              {i < active ? '✓' : i + 1}
            </div>
            <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 52, color: C.ink, letterSpacing: -1, lineHeight: 1.1}}>{t}</div>
          </div>
        );
      })}
      <div style={{height: 0, opacity: f * 0}} />
    </div>
  );
};

const Step1: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Terminal title="Claude Code">
      <div style={{color: C.accent}}>{'>'} <span style={{color: '#d7dae0'}}><Typed text="/plugin install swarm" start={8} cps={0.9} /></span></div>
      <div style={{marginTop: 14, color: C.muted, opacity: fade(f, 52)}}>Installing swarm…</div>
      <div style={{marginTop: 6, color: C.accent, opacity: fade(f, 70)}}>✓ Installed</div>
    </Terminal>
  );
};

const Step2: React.FC = () => {
  const f = useCurrentFrame();
  const picked = f > 58;
  const Card = ({name, sub, on}: {name: string; sub: string; on: boolean}) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 22, padding: '20px 26px', borderRadius: 16, border: `2px solid ${on ? C.accent : C.line}`, background: on ? C.accentSoft : 'transparent', marginTop: 16}}>
      <div style={{width: 30, height: 30, borderRadius: 15, border: `3px solid ${on ? C.accent : C.muted}`, background: on ? C.accent : 'transparent'}} />
      <div>
        <div style={{color: C.ink, fontSize: 32, fontWeight: 700}}>{name}</div>
        <div style={{color: C.muted, fontSize: 24, fontFamily: SANS}}>{sub}</div>
      </div>
    </div>
  );
  return (
    <Terminal title="Claude Code">
      <div style={{color: C.accent}}>{'>'} <span style={{color: '#d7dae0'}}><Typed text="set up Swarm" start={4} cps={0.8} /></span></div>
      <div style={{marginTop: 14, color: C.muted, fontFamily: SANS, fontSize: 28, opacity: fade(f, 30)}}>Projects that opted in. Which one?</div>
      <div style={{opacity: fade(f, 36)}}>
        <Card name="core" sub="Swarm improves itself" on={picked} />
        <Card name="gtm" sub="Writes go-to-market assets" on={false} />
      </div>
      <div style={{marginTop: 18, color: C.accent, opacity: fade(f, 70), fontFamily: SANS, fontSize: 28}}>You pick. Only this project gets your tokens.</div>
    </Terminal>
  );
};

const Step3: React.FC = () => {
  const f = useCurrentFrame();
  const lines: [number, React.ReactNode][] = [
    [6, <><span style={{color: C.blue}}>›</span> Quota check: 40% of the week used, 20% kept in reserve</>],
    [26, <><span style={{color: C.blue}}>›</span> Picked task: support {'{a,b}'} in path globs</>],
    [46, <><span style={{color: C.blue}}>›</span> Claude writes the change</>],
    [68, <><span style={{color: C.blue}}>›</span> Tests run in a sandbox</>],
    [84, <span style={{color: C.accent}}>✓ Tests pass. Pull request opened.</span>],
  ];
  const s = spring({frame: f - 96, fps: 30, config: {damping: 13}});
  return (
    <div style={{position: 'relative'}}>
      <Terminal title="swarm run">
        {lines.map(([t, node], i) => (
          <div key={i} style={{opacity: fade(f, t, 8), fontSize: 27}}>{node}</div>
        ))}
      </Terminal>
      <div style={{position: 'absolute', right: -40, bottom: -50, transform: `scale(${s})`, opacity: f > 96 ? 1 : 0, background: C.panel, border: `2px solid ${C.accent}`, borderRadius: 20, padding: '22px 32px', boxShadow: `0 20px 60px ${C.accent}33`}}>
        <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 34, color: C.ink}}>🔀 Pull request opened</div>
        <div style={{fontFamily: MONO, fontSize: 24, color: C.muted, marginTop: 6}}>in 23 seconds · $0.07 of tokens</div>
      </div>
    </div>
  );
};

const Scene3: React.FC = () => {
  const f = useCurrentFrame();
  const active = f < 105 ? 0 : f < 210 ? 1 : 2;
  const local = active === 0 ? f : active === 1 ? f - 105 : f - 210;
  return (
    <AbsoluteFill style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 70, padding: '0 90px'}}>
      <StepList active={active} />
      <div key={active} style={{opacity: fade(local, 0, 10), transform: `translateX(${interpolate(local, [0, 14], [40, 0], {...clamp, easing: ease})}px)`}}>
        <Sequence from={0} layout="none">
          {active === 0 ? <ShiftFrame f={local}><Step1 /></ShiftFrame> : active === 1 ? <ShiftFrame f={local}><Step2 /></ShiftFrame> : <ShiftFrame f={local}><Step3 /></ShiftFrame>}
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};

// Re-base the frame for a step panel so its inner animations start at 0.
const ShiftFrame: React.FC<{f: number; children: React.ReactNode}> = ({f, children}) => {
  const offset = useCurrentFrame() - f;
  return <Sequence from={offset} layout="none">{children}</Sequence>;
};

// ---------- Scene 4: trust + end card ----------
const TRUST = [
  'Your Claude, your login. Nothing pooled.',
  'The agent has no shell and no web access.',
  'Tests re-run in CI. The result is signed.',
  'A human maintainer decides what merges.',
];

const Scene4: React.FC = () => {
  const f = useCurrentFrame();
  const trustOpacity = interpolate(f, [140, 158], [1, 0], clamp);
  const endOpacity = fade(f, 158, 14);
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', opacity: trustOpacity, display: 'flex', flexDirection: 'column', gap: 38}}>
        <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 70, color: C.ink, letterSpacing: -1.5, opacity: fade(f, 0)}}>Why it is safe</div>
        {TRUST.map((t, i) => (
          <Pop key={t} start={14 + i * 30}>
            <div style={{display: 'flex', alignItems: 'center', gap: 28}}>
              <div style={{width: 58, height: 58, borderRadius: 29, background: C.accentSoft, border: `2px solid ${C.accent}`, color: C.accent, fontSize: 34, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>✓</div>
              <div style={{fontFamily: SANS, fontSize: 52, color: C.ink}}>{t}</div>
            </div>
          </Pop>
        ))}
      </div>
      <div style={{position: 'absolute', opacity: endOpacity, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, transform: `translateY(${rise(f, 158, 20)}px)`}}>
        <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 170, color: C.accent, letterSpacing: -5}}>Swarm</div>
        <Headline size={64}>Spare tokens. Real pull requests.</Headline>
        <div style={{fontFamily: MONO, fontSize: 40, color: C.muted, marginTop: 14}}>github.com/serg1210/swarm</div>
        <div style={{fontFamily: MONO, fontSize: 24, color: C.warn, border: `1px solid ${C.line}`, borderRadius: 10, padding: '6px 18px'}}>v0.1</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Timeline ----------
export const Video: React.FC = () => {
  const f = useCurrentFrame();
  const glow = 0.5 + 0.5 * Math.sin(f / 60);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 120%, ${C.accent}${Math.round(18 + glow * 10).toString(16).padStart(2, '0')}, transparent 60%)`}} />
      <Sequence from={0} durationInFrames={165}><Scene1 /><Audio src={staticFile('vo/s1.mp3')} /></Sequence>
      <Sequence from={165} durationInFrames={120}><Scene2 /><Audio src={staticFile('vo/s2.mp3')} /></Sequence>
      <Sequence from={285} durationInFrames={360}>
        <Scene3 />
        <Sequence from={0}><Audio src={staticFile('vo/s3a.mp3')} /></Sequence>
        <Sequence from={105}><Audio src={staticFile('vo/s3b.mp3')} /></Sequence>
        <Sequence from={210}><Audio src={staticFile('vo/s3c.mp3')} /></Sequence>
      </Sequence>
      <Sequence from={645} durationInFrames={255}>
        <Scene4 />
        <Audio src={staticFile('vo/s4a.mp3')} />
        <Sequence from={162}><Audio src={staticFile('vo/s4b.mp3')} /></Sequence>
      </Sequence>
    </AbsoluteFill>
  );
};
