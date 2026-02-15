import { SaleState } from '../value-objects/sale-state.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { Stock } from '../value-objects/stock.vo';

export interface TransitionContext {
  now: Date;
  timeRange: TimeRange;
  stock: Stock;
}

export class SaleStateMachine {
  private static readonly TRANSITIONS: Record<
    SaleState,
    { target: SaleState; guard: (ctx: TransitionContext) => boolean }[]
  > = {
    [SaleState.UPCOMING]: [
      {
        target: SaleState.ACTIVE,
        guard: (ctx) => !ctx.timeRange.isBeforeStart(ctx.now),
      },
    ],
    [SaleState.ACTIVE]: [
      {
        target: SaleState.ENDED,
        guard: (ctx) => ctx.timeRange.isPastEnd(ctx.now) || ctx.stock.isZero,
      },
    ],
    [SaleState.ENDED]: [],
  };

  static canTransition(current: SaleState, target: SaleState, ctx: TransitionContext): boolean {
    const allowed = this.TRANSITIONS[current];
    return allowed.some((t) => t.target === target && t.guard(ctx));
  }

  static getNextState(current: SaleState, ctx: TransitionContext): SaleState | null {
    const allowed = this.TRANSITIONS[current];
    const transition = allowed.find((t) => t.guard(ctx));
    return transition?.target ?? null;
  }
}
