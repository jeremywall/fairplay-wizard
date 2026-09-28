// Prints SQL that adds a sample team (12 made-up players and 3 finalized
// 3-inning games) for an existing coach account. For staging and local dev
// only. Sign up in the app first, then:
//
//   node scripts/seed-sample-team.mjs you@example.com > seed.sql
//   npx wrangler d1 execute fairplay-staging --remote --env staging --file seed.sql
//
// If no account has that email, the team insert adds nothing and the player
// inserts fail on the foreign key, so nothing half-seeded is left behind.

import { randomUUID } from "node:crypto";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/seed-sample-team.mjs <coach email>");
  process.exit(1);
}

const q = (value) => (value === null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

const players = ["Avery", "Blake", "Casey", "Drew", "Emerson", "Finley", "Gray", "Harper", "Indy", "Jordan", "Kai", "Logan"];

// Positions by inning for each player present; players not listed were absent.
const games = [
  {
    date: "2026-09-13",
    opponent: "Sample Knights",
    lineup: {
      Avery: ["P", "C", "RC"], Blake: ["C", "1B", "3B"], Casey: ["3B", "RC", "1B"], Drew: ["RC", "3B", "LF"],
      Emerson: ["1B", "LF", "P"], Gray: ["LF", "P", "RF"], Harper: ["LC", "2B", "SS"], Jordan: ["2B", "LC", "C"],
      Kai: ["SS", "RF", "2B"], Logan: ["RF", "SS", "LC"],
    },
  },
  {
    date: "2026-09-20",
    opponent: "Sample Rockets",
    lineup: {
      Avery: ["3B", "LF", "1B"], Blake: ["RC", "2B", "LC"], Casey: ["LF", "P", "BN"], Drew: ["1B", "SS", "RF"],
      Emerson: ["C", "RC", "3B"], Finley: ["SS", "BN", "2B"], Harper: ["RF", "1B", "LF"], Indy: ["LC", "C", "P"],
      Jordan: ["BN", "LC", "C"], Kai: ["P", "RF", "SS"], Logan: ["2B", "3B", "RC"],
    },
  },
  {
    date: "2026-09-27",
    opponent: "Sample Blueberries",
    lineup: {
      Blake: ["LF", "SS", "RF"], Casey: ["2B", "C", "LC"], Drew: ["P", "3B", "2B"], Emerson: ["LC", "2B", "SS"],
      Finley: ["RF", "P", "RC"], Harper: ["3B", "RC", "LF"], Indy: ["RC", "1B", "3B"], Jordan: ["SS", "LF", "P"],
      Kai: ["1B", "LC", "C"], Logan: ["C", "RF", "1B"],
    },
  },
];

const teamId = randomUUID();
const playerIds = Object.fromEntries(players.map((name) => [name, randomUUID()]));
const coach = `(SELECT id FROM "user" WHERE email = ${q(email)})`;

const sql = [
  `INSERT INTO team (id, name, innings_per_game, min_defensive_outs, min_infield_innings, alignment_mode)
   SELECT ${q(teamId)}, 'Sample Team', 3, 6, 1, 10 WHERE EXISTS ${coach};`,
  `INSERT INTO team_coach (team_id, user_id, role) SELECT ${q(teamId)}, id, 'head' FROM "user" WHERE email = ${q(email)};`,
  ...players.map(
    (name, k) => `INSERT INTO player (id, team_id, name, roster_order) VALUES (${q(playerIds[name])}, ${q(teamId)}, ${q(name)}, ${k + 1});`,
  ),
];

for (const game of games) {
  const gameId = randomUUID();
  const present = players.filter((name) => game.lineup[name]);
  sql.push(
    `INSERT INTO game (id, team_id, game_date, opponent, innings, alignment_mode, pitcher_inning_limit, min_defensive_outs, min_infield_innings, status, finalized_at)
     VALUES (${q(gameId)}, ${q(teamId)}, ${q(game.date)}, ${q(game.opponent)}, 3, 10, 1, 6, 1, 'final', datetime('now'));`,
    ...present.map(
      (name, k) => `INSERT INTO game_player (game_id, player_id, lineup_order) VALUES (${q(gameId)}, ${q(playerIds[name])}, ${k + 1});`,
    ),
    ...present.flatMap((name) =>
      game.lineup[name].map(
        (slot, i) =>
          `INSERT INTO game_assignment (game_id, player_id, inning, slot) VALUES (${q(gameId)}, ${q(playerIds[name])}, ${i + 1}, ${q(slot)});`,
      ),
    ),
  );
}

console.log(sql.join("\n"));
