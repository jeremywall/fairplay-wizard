/**
 * Continuous batting order that carries over between games.
 *
 * The team has one fixed batting order. Each game resumes with the next player
 * after the last player who actually batted in the previous game, skipping
 * anyone absent from this game.
 */

/**
 * Returns the batting order for a game.
 *
 * @param fixedOrder Player ids in the team's fixed batting order.
 * @param present Ids of the players at this game.
 * @param lastBatterId The last player who batted in the previous game, or null
 *   to start from the top. If that player is no longer in the fixed order, the
 *   order also starts from the top.
 */
export function battingOrderForGame(
  fixedOrder: readonly string[],
  present: ReadonlySet<string>,
  lastBatterId: string | null,
): string[] {
  const lastIndex = lastBatterId === null ? -1 : fixedOrder.indexOf(lastBatterId);
  const order: string[] = [];
  for (let offset = 1; offset <= fixedOrder.length; offset++) {
    const id = fixedOrder[(lastIndex + offset) % fixedOrder.length];
    if (present.has(id)) order.push(id);
  }
  return order;
}

/**
 * Returns the last player to bat in a game, which becomes the carry-over
 * pointer for the next game, or null if nobody batted.
 *
 * @param gameOrder The batting order used for the game.
 * @param plateAppearances Total plate appearances the team had in the game.
 */
export function lastBatterOfGame(gameOrder: readonly string[], plateAppearances: number): string | null {
  if (gameOrder.length === 0 || plateAppearances <= 0) return null;
  return gameOrder[(plateAppearances - 1) % gameOrder.length];
}
