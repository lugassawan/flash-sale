import { SaleStateMachine } from '../../../src/core/domain/sale/services/sale-state-machine.service';
import { SaleState } from '../../../src/core/domain/sale/value-objects/sale-state.vo';
import { Stock } from '../../../src/core/domain/sale/value-objects/stock.vo';
import { TimeRange } from '../../../src/core/domain/sale/value-objects/time-range.vo';

describe('SaleStateMachine Service', () => {
  const start = new Date('2026-02-15T10:00:00Z');
  const end = new Date('2026-02-15T12:00:00Z');
  const timeRange = TimeRange.create(start, end);

  function ctx(
    overrides: {
      now?: Date;
      stock?: Stock;
      timeRange?: TimeRange;
    } = {},
  ) {
    return {
      now: overrides.now ?? new Date('2026-02-15T10:30:00Z'),
      timeRange: overrides.timeRange ?? timeRange,
      stock: overrides.stock ?? Stock.create(10),
    };
  }

  describe('canTransition', () => {
    it('should allow UPCOMING → ACTIVE when start time reached', () => {
      expect(
        SaleStateMachine.canTransition(SaleState.UPCOMING, SaleState.ACTIVE, ctx({ now: start })),
      ).toBe(true);
    });

    it('should allow UPCOMING → ACTIVE when past start time', () => {
      expect(
        SaleStateMachine.canTransition(
          SaleState.UPCOMING,
          SaleState.ACTIVE,
          ctx({ now: new Date('2026-02-15T10:30:00Z') }),
        ),
      ).toBe(true);
    });

    it('should NOT allow UPCOMING → ACTIVE before start time', () => {
      expect(
        SaleStateMachine.canTransition(
          SaleState.UPCOMING,
          SaleState.ACTIVE,
          ctx({ now: new Date('2026-02-15T09:00:00Z') }),
        ),
      ).toBe(false);
    });

    it('should NOT allow UPCOMING → ENDED directly', () => {
      expect(SaleStateMachine.canTransition(SaleState.UPCOMING, SaleState.ENDED, ctx())).toBe(
        false,
      );
    });

    it('should allow ACTIVE → ENDED when end time reached', () => {
      expect(
        SaleStateMachine.canTransition(SaleState.ACTIVE, SaleState.ENDED, ctx({ now: end })),
      ).toBe(true);
    });

    it('should allow ACTIVE → ENDED when stock is zero', () => {
      expect(
        SaleStateMachine.canTransition(
          SaleState.ACTIVE,
          SaleState.ENDED,
          ctx({ stock: Stock.create(0) }),
        ),
      ).toBe(true);
    });

    it('should NOT allow ACTIVE → ENDED when within range and has stock', () => {
      expect(
        SaleStateMachine.canTransition(
          SaleState.ACTIVE,
          SaleState.ENDED,
          ctx({ now: new Date('2026-02-15T11:00:00Z'), stock: Stock.create(5) }),
        ),
      ).toBe(false);
    });

    it('should NOT allow any transition out of ENDED', () => {
      expect(SaleStateMachine.canTransition(SaleState.ENDED, SaleState.ACTIVE, ctx())).toBe(false);
      expect(SaleStateMachine.canTransition(SaleState.ENDED, SaleState.UPCOMING, ctx())).toBe(
        false,
      );
    });
  });

  describe('getNextState', () => {
    it('should return ACTIVE for UPCOMING when start time reached', () => {
      expect(SaleStateMachine.getNextState(SaleState.UPCOMING, ctx({ now: start }))).toBe(
        SaleState.ACTIVE,
      );
    });

    it('should return null for UPCOMING before start time', () => {
      expect(
        SaleStateMachine.getNextState(
          SaleState.UPCOMING,
          ctx({ now: new Date('2026-02-15T09:00:00Z') }),
        ),
      ).toBeNull();
    });

    it('should return ENDED for ACTIVE when end time reached', () => {
      expect(SaleStateMachine.getNextState(SaleState.ACTIVE, ctx({ now: end }))).toBe(
        SaleState.ENDED,
      );
    });

    it('should return ENDED for ACTIVE when stock is zero', () => {
      expect(SaleStateMachine.getNextState(SaleState.ACTIVE, ctx({ stock: Stock.create(0) }))).toBe(
        SaleState.ENDED,
      );
    });

    it('should return null for ACTIVE within range with stock', () => {
      expect(SaleStateMachine.getNextState(SaleState.ACTIVE, ctx())).toBeNull();
    });

    it('should return null for ENDED (terminal state)', () => {
      expect(SaleStateMachine.getNextState(SaleState.ENDED, ctx())).toBeNull();
    });
  });
});
