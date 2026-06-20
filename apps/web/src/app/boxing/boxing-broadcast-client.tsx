"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  Lock,
  Radio,
  RotateCcw,
  Shield,
  Ticket,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";

import styles from "./page.module.css";

type Corner = "red" | "blue";

type Fighter = {
  age: number;
  corner: Corner;
  guard: number;
  height: string;
  id: string;
  momentum: number;
  name: string;
  odds: string;
  reach: string;
  shorts: string;
  stamina: number;
  style: string;
  weight: string;
};

type FeedItem = {
  actor: Corner;
  icon: "glove" | "shield" | "spark" | "slip";
  text: string;
  time: string;
};

const fighters: Fighter[] = [
  {
    age: 26,
    corner: "red",
    guard: 74,
    height: "5'10\"",
    id: "reed",
    momentum: 68,
    name: "Reed",
    odds: "1.85",
    reach: "72\"",
    shorts: "Pressure",
    stamina: 78,
    style: "Aggressor",
    weight: "154 lb",
  },
  {
    age: 27,
    corner: "blue",
    guard: 63,
    height: "5'11\"",
    id: "diaz",
    momentum: 54,
    name: "Diaz",
    odds: "1.85",
    reach: "73\"",
    shorts: "Counter",
    stamina: 70,
    style: "Technician",
    weight: "154 lb",
  },
];

const feed: FeedItem[] = [
  {
    actor: "red",
    icon: "glove",
    text: "Reed lands a jab.",
    time: "00:41",
  },
  {
    actor: "blue",
    icon: "shield",
    text: "Diaz blocks high.",
    time: "00:37",
  },
  {
    actor: "blue",
    icon: "slip",
    text: "Diaz slips outside.",
    time: "00:33",
  },
  {
    actor: "red",
    icon: "spark",
    text: "Hard right. Reed connects.",
    time: "00:28",
  },
  {
    actor: "blue",
    icon: "glove",
    text: "Diaz counters to the body.",
    time: "00:22",
  },
  {
    actor: "red",
    icon: "glove",
    text: "Reed presses forward.",
    time: "00:18",
  },
];

const stats = [
  { key: "stamina", label: "Stamina" },
  { key: "guard", label: "Guard" },
  { key: "momentum", label: "Momentum" },
] as const;

const quickStakes = [20, 50, 100, 250];

export function BoxingBroadcastClient() {
  const [selectedFighterId, setSelectedFighterId] = useState(fighters[0].id);
  const [stake, setStake] = useState(120);
  const [isTicketLocked, setIsTicketLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(41);
  const [activeFeedIndex, setActiveFeedIndex] = useState(0);
  const selectedFighter = useMemo(
    () => fighters.find((fighter) => fighter.id === selectedFighterId) ?? fighters[0],
    [selectedFighterId],
  );
  const formattedClock = useMemo(() => formatClock(timeLeft), [timeLeft]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((current) => (current <= 12 ? 41 : current - 1));
      setActiveFeedIndex((current) => (current + 1) % feed.length);
    }, 1600);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handleLockTicket = () => {
    setIsTicketLocked(true);
  };

  const handleResetTicket = () => {
    setIsTicketLocked(false);
    setSelectedFighterId(fighters[0].id);
    setStake(120);
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <FighterPanel fighter={fighters[0]} />

          <section className={styles.scoreboard} aria-label="Fight clock">
            <div className={styles.brandRow}>
              <span className={styles.star}>*</span>
              <h1>BK Fight Night</h1>
              <span className={styles.star}>*</span>
            </div>
            <div className={styles.broadcastRibbon}>
              <Radio className={styles.ribbonIcon} aria-hidden="true" />
              Live Boxing Broadcast
            </div>
            <div className={styles.clockDeck}>
              <div>
                <span>Round</span>
                <strong>2 / 3</strong>
              </div>
              <div className={styles.clock}>
                <Timer aria-hidden="true" />
                <strong>{formattedClock}</strong>
              </div>
              <div>
                <span>Phase</span>
                <strong>Round Active</strong>
              </div>
            </div>
          </section>

          <FighterPanel fighter={fighters[1]} />
        </header>

        <section className={styles.stageGrid} aria-label="Boxing broadcast preview">
          <div className={styles.stageColumn}>
            <RingStage activeFeed={feed[activeFeedIndex]} />
            <TapePanel />
          </div>
          <aside className={styles.feedPanel} aria-label="Live action feed">
            <div className={styles.panelTitle}>
              <CircleDot aria-hidden="true" />
              <h2>Live Action</h2>
            </div>
            <ol className={styles.feedList}>
              {feed.map((item, index) => (
                <li
                  className={index === activeFeedIndex ? styles.activeFeedItem : undefined}
                  data-corner={item.actor}
                  key={`${item.time}-${item.text}`}
                >
                  <time>{item.time}</time>
                  <FeedIcon icon={item.icon} />
                  <span>{item.text}</span>
                </li>
              ))}
            </ol>
            <div className={styles.feedFooter}>
              <Radio aria-hidden="true" />
              <strong>Live from BK Arena</strong>
            </div>
          </aside>
        </section>

        <BettingDesk
          isTicketLocked={isTicketLocked}
          onLockTicket={handleLockTicket}
          onResetTicket={handleResetTicket}
          onSelectFighter={setSelectedFighterId}
          selectedFighter={selectedFighter}
          selectedFighterId={selectedFighterId}
          setStake={setStake}
          stake={stake}
        />
      </div>
    </main>
  );
}

function FighterPanel({ fighter }: { fighter: Fighter }) {
  return (
    <section className={styles.fighterPanel} data-corner={fighter.corner}>
      <div className={styles.cornerRail}>{fighter.corner} corner</div>
      <div className={styles.fighterPortrait} aria-hidden="true">
        <div className={styles.portraitHair} />
        <div className={styles.portraitFace} />
        <div className={styles.portraitShoulder} />
        <div className={styles.portraitGlove} />
      </div>
      <div className={styles.fighterInfo}>
        <div className={styles.fighterNameRow}>
          <h2>{fighter.name}</h2>
          <span>{fighter.style}</span>
        </div>
        <div className={styles.statsGrid}>
          {stats.map((stat) => (
            <StatBar
              corner={fighter.corner}
              key={stat.key}
              label={stat.label}
              value={fighter[stat.key]}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatBar({
  corner,
  label,
  value,
}: {
  corner: Corner;
  label: string;
  value: number;
}) {
  const filledSegments = Math.round(value / 10);

  return (
    <div className={styles.statRow} data-corner={corner}>
      <span>{label}</span>
      <div className={styles.statSegments} aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => (
          <i data-lit={index < filledSegments ? "true" : "false"} key={index} />
        ))}
      </div>
    </div>
  );
}

function RingStage({ activeFeed }: { activeFeed: FeedItem }) {
  return (
    <section className={styles.ringStage} aria-label="Live boxing ring">
      <div className={styles.crowdLayer} aria-hidden="true">
        {Array.from({ length: 56 }).map((_, index) => (
          <i key={index} />
        ))}
      </div>
      <div className={styles.lightBar} aria-hidden="true" />
      <div className={styles.ropeLayer} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={styles.cornerPost} data-corner="red" aria-hidden="true" />
      <div className={styles.cornerPost} data-corner="blue" aria-hidden="true" />
      <div className={styles.canvasLogo} aria-hidden="true">
        BK
      </div>
      <FighterAvatar corner="red" pose="jab" />
      <FighterAvatar corner="blue" pose="block" />
      <div className={styles.impactBurst} data-corner={activeFeed.actor} aria-hidden="true">
        POW
      </div>
      <div className={styles.exchangeChip} data-corner={activeFeed.actor}>
        <Zap aria-hidden="true" />
        <span>{activeFeed.text}</span>
      </div>
    </section>
  );
}

function FighterAvatar({ corner, pose }: { corner: Corner; pose: "jab" | "block" }) {
  return (
    <div className={styles.boxer} data-corner={corner} data-pose={pose}>
      <div className={styles.boxerShadow} />
      <div className={styles.backLeg} />
      <div className={styles.frontLeg} />
      <div className={styles.body} />
      <div className={styles.head} />
      <div className={styles.hair} />
      <div className={styles.backArm} />
      <div className={styles.frontArm}>
        <span />
      </div>
      <div className={styles.shorts} />
      <div className={styles.bootBack} />
      <div className={styles.bootFront} />
    </div>
  );
}

function TapePanel() {
  return (
    <section className={styles.tapePanel} aria-label="Tale of the tape">
      <div className={styles.panelTitle}>
        <Trophy aria-hidden="true" />
        <h2>Tale of the Tape</h2>
      </div>
      <div className={styles.tapeGrid}>
        <TapeColumn fighter={fighters[0]} />
        <div className={styles.tapeLabels}>
          <span>Age</span>
          <span>Height</span>
          <span>Weight</span>
          <span>Reach</span>
          <span>Style</span>
        </div>
        <TapeColumn fighter={fighters[1]} />
      </div>
      <div className={styles.weightClass}>Same weight class</div>
    </section>
  );
}

function TapeColumn({ fighter }: { fighter: Fighter }) {
  return (
    <div className={styles.tapeColumn} data-corner={fighter.corner}>
      <strong>{fighter.name}</strong>
      <span>{fighter.age}</span>
      <span>{fighter.height}</span>
      <span>{fighter.weight}</span>
      <span>{fighter.reach}</span>
      <span>{fighter.shorts}</span>
    </div>
  );
}

function BettingDesk({
  isTicketLocked,
  onLockTicket,
  onResetTicket,
  onSelectFighter,
  selectedFighter,
  selectedFighterId,
  setStake,
  stake,
}: {
  isTicketLocked: boolean;
  onLockTicket: () => void;
  onResetTicket: () => void;
  onSelectFighter: (fighterId: string) => void;
  selectedFighter: Fighter;
  selectedFighterId: string;
  setStake: (stake: number) => void;
  stake: number;
}) {
  return (
    <section className={styles.bettingDesk} aria-label="Winner betting preview">
      <div className={styles.betIntro}>
        <Ticket aria-hidden="true" />
        <div>
          <h2>Winner Bet</h2>
          <span>{isTicketLocked ? "Betting locked" : "Pick a corner"}</span>
        </div>
      </div>

      <div className={styles.winnerButtons}>
        {fighters.map((fighter) => (
          <button
            className={selectedFighterId === fighter.id ? styles.selectedWinner : undefined}
            data-corner={fighter.corner}
            disabled={isTicketLocked}
            key={fighter.id}
            onClick={() => onSelectFighter(fighter.id)}
            type="button"
          >
            <strong>{fighter.name}</strong>
            <span>{fighter.odds}</span>
          </button>
        ))}
      </div>

      <div className={styles.stakePanel}>
        <div className={styles.lockState} data-locked={isTicketLocked ? "true" : "false"}>
          <Lock aria-hidden="true" />
          <strong>{isTicketLocked ? "Betting Locked" : "Betting Open"}</strong>
          <span>{isTicketLocked ? "Accepted odds copied to ticket" : "Winner market only"}</span>
        </div>
        <div className={styles.stakeControls}>
          <span>Stake</span>
          <strong>{stake} P</strong>
          <div>
            {quickStakes.map((amount) => (
              <button
                disabled={isTicketLocked}
                key={amount}
                onClick={() => setStake(amount)}
                type="button"
              >
                {amount}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.ticketPanel} data-locked={isTicketLocked ? "true" : "false"}>
        <div className={styles.ticketHeader}>
          <span>Your Ticket</span>
          {isTicketLocked ? (
            <strong>
              <CheckCircle2 aria-hidden="true" />
              Accepted
            </strong>
          ) : (
            <strong>Ready</strong>
          )}
        </div>
        <dl>
          <div>
            <dt>Winner</dt>
            <dd>{selectedFighter.name}</dd>
          </div>
          <div>
            <dt>Stake</dt>
            <dd>{stake} P</dd>
          </div>
          <div>
            <dt>Market</dt>
            <dd>Winner</dd>
          </div>
        </dl>
      </div>

      <div className={styles.betActions}>
        <button disabled={isTicketLocked} onClick={onLockTicket} type="button">
          <Lock aria-hidden="true" />
          Lock demo ticket
        </button>
        <button onClick={onResetTicket} type="button">
          <RotateCcw aria-hidden="true" />
          Reset
        </button>
      </div>
    </section>
  );
}

function FeedIcon({ icon }: { icon: FeedItem["icon"] }) {
  if (icon === "shield") {
    return <Shield className={styles.feedIcon} aria-hidden="true" />;
  }

  if (icon === "spark") {
    return <Zap className={styles.feedIcon} aria-hidden="true" />;
  }

  if (icon === "slip") {
    return <CircleDot className={styles.feedIcon} aria-hidden="true" />;
  }

  return <span className={styles.gloveIcon} aria-hidden="true" />;
}

function formatClock(seconds: number) {
  const minutesText = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secondsText = (seconds % 60).toString().padStart(2, "0");

  return `${minutesText}:${secondsText}`;
}
