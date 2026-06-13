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
};

const horses: HorseEntry[] = [
  {
    color: "red",
    duration: "11.8s",
    file: "/racing/generated-reference-style/horse-01-red-gallop-7f.png",
    lane: 1,
    laneTop: "24%",
    number: 1,
    offset: "-7.6s",
    rank: "1st",
  },
  {
    color: "orange",
    duration: "12.3s",
    file: "/racing/generated-reference-style/horse-02-orange-gallop-7f.png",
    lane: 2,
    laneTop: "33%",
    number: 2,
    offset: "-6.2s",
    rank: "2nd",
  },
  {
    color: "blue",
    duration: "12.7s",
    file: "/racing/generated-reference-style/horse-03-blue-gallop-7f.png",
    lane: 3,
    laneTop: "42%",
    number: 3,
    offset: "-4.9s",
    rank: "3rd",
  },
  {
    color: "yellow",
    duration: "13.1s",
    file: "/racing/generated-reference-style/horse-04-yellow-gallop-7f.png",
    lane: 4,
    laneTop: "51%",
    number: 4,
    offset: "-3.5s",
    rank: "4th",
  },
  {
    color: "purple",
    duration: "13.6s",
    file: "/racing/generated-reference-style/horse-05-purple-gallop-7f.png",
    lane: 5,
    laneTop: "60%",
    number: 5,
    offset: "-2.2s",
    rank: "5th",
  },
  {
    color: "green",
    duration: "14.2s",
    file: "/racing/generated-reference-style/horse-06-green-gallop-7f.png",
    lane: 6,
    laneTop: "67%",
    number: 6,
    offset: "-0.9s",
    rank: "6th",
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
            <span>RUNNING</span>
            <strong>6 entries</strong>
          </div>
        </header>

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
