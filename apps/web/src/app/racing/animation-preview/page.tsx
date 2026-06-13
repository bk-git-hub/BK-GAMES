import type { CSSProperties } from "react";

import styles from "./page.module.css";

type HorseEntry = {
  color: string;
  duration: string;
  file: string;
  lane: number;
  laneTop: string;
  number: number;
  offset: string;
  rank: string;
  startLaneTop: string;
  startX: string;
};

const horses: HorseEntry[] = [
  {
    color: "red",
    duration: "11.8s",
    file: "/racing/generated-reference-style/horse-01-red-gallop-7f.png",
    lane: 1,
    laneTop: "14%",
    number: 1,
    offset: "-7.6s",
    rank: "1st",
    startLaneTop: "31%",
    startX: "8%",
  },
  {
    color: "orange",
    duration: "12.3s",
    file: "/racing/generated-reference-style/horse-02-orange-gallop-7f.png",
    lane: 2,
    laneTop: "23%",
    number: 2,
    offset: "-6.2s",
    rank: "2nd",
    startLaneTop: "39.5%",
    startX: "10.5%",
  },
  {
    color: "blue",
    duration: "12.7s",
    file: "/racing/generated-reference-style/horse-03-blue-gallop-7f.png",
    lane: 3,
    laneTop: "32%",
    number: 3,
    offset: "-4.9s",
    rank: "3rd",
    startLaneTop: "48%",
    startX: "13%",
  },
  {
    color: "yellow",
    duration: "13.1s",
    file: "/racing/generated-reference-style/horse-04-yellow-gallop-7f.png",
    lane: 4,
    laneTop: "41%",
    number: 4,
    offset: "-3.5s",
    rank: "4th",
    startLaneTop: "56.5%",
    startX: "15.5%",
  },
  {
    color: "purple",
    duration: "13.6s",
    file: "/racing/generated-reference-style/horse-05-purple-gallop-7f.png",
    lane: 5,
    laneTop: "50%",
    number: 5,
    offset: "-2.2s",
    rank: "5th",
    startLaneTop: "65%",
    startX: "18%",
  },
  {
    color: "green",
    duration: "14.2s",
    file: "/racing/generated-reference-style/horse-06-green-gallop-7f.png",
    lane: 6,
    laneTop: "57%",
    number: 6,
    offset: "-0.9s",
    rank: "6th",
    startLaneTop: "73.5%",
    startX: "20.5%",
  },
];

export default function RacingAnimationPreviewPage() {
  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="preview-title">
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>BK</span>
            <div>
              <h1 id="preview-title">Racing Animation</h1>
              <p>Asset path preview</p>
            </div>
          </div>
          <div className={styles.statusBar} aria-label="Preview status">
            <span className={styles.liveDot} />
            <span>PRE-RACE</span>
            <strong>6 entries</strong>
          </div>
        </header>

        <section className={styles.startFrame} aria-label="Pre-race start state preview">
          <div className={styles.startTrack}>
            <div className={styles.startHud} aria-label="Start state">
              <span>GATE READY</span>
              <strong>00:03</strong>
            </div>
            {horses.map((horse) => (
              <div
                className={styles.starter}
                key={horse.number}
                style={
                  {
                    "--start-lane-top": horse.startLaneTop,
                    "--start-x": horse.startX,
                    zIndex: 20 + horse.lane,
                  } as CSSProperties
                }
              >
                <div
                  aria-label={`${horse.number}번 말 출발 대기 상태`}
                  className={styles.staticSprite}
                  style={
                    {
                      "--sprite": `url("${horse.file}")`,
                    } as CSSProperties
                  }
                />
                <span className={`${styles.startBadge} ${styles[horse.color]}`}>
                  {horse.number}
                </span>
              </div>
            ))}
          </div>

          <aside className={styles.startPanel} aria-label="Start lane status">
            <h2>Start Gate</h2>
            <ol>
              {horses.map((horse) => (
                <li key={horse.number}>
                  <span className={`${styles.badge} ${styles[horse.color]}`}>
                    {horse.number}
                  </span>
                  <span>Lane {horse.lane}</span>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        <div className={styles.raceFrame}>
          <div className={styles.track} aria-label="Animated horse race preview">
            <div className={styles.finishLine} aria-hidden="true" />
            {horses.map((horse) => (
              <div
                className={styles.runner}
                key={horse.number}
                style={
                  {
                    "--duration": horse.duration,
                    "--lane-top": horse.laneTop,
                    "--offset": horse.offset,
                    zIndex: 10 + horse.lane,
                  } as CSSProperties
                }
              >
                <div
                  aria-label={`${horse.number}번 말 달리기 애니메이션`}
                  className={styles.sprite}
                  style={
                    {
                      "--sprite": `url("${horse.file}")`,
                    } as CSSProperties
                  }
                />
              </div>
            ))}
          </div>

          <aside className={styles.rankPanel} aria-label="Live rank preview">
            <h2>Live Rank</h2>
            <ol>
              {horses.map((horse) => (
                <li key={horse.number}>
                  <span className={`${styles.badge} ${styles[horse.color]}`}>
                    {horse.number}
                  </span>
                  <span>{horse.rank}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <section className={styles.spriteRows} aria-label="Individual spritesheet rows">
          {horses.map((horse) => (
            <article className={styles.spriteCard} key={horse.number}>
              <div className={styles.cardTop}>
                <span className={`${styles.badge} ${styles[horse.color]}`}>
                  {horse.number}
                </span>
                <span>{horse.color}</span>
              </div>
              <div
                aria-label={`${horse.number}번 말 개별 spritesheet preview`}
                className={styles.rowSprite}
                style={
                  {
                    "--sprite": `url("${horse.file}")`,
                  } as CSSProperties
                }
              />
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
