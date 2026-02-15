import { SaleState } from '../../../src/core/domain/sale/value-objects/sale-state.vo';

describe('SaleState Value Object', () => {
  it('should have UPCOMING state', () => {
    expect(SaleState.UPCOMING).toBe('UPCOMING');
  });

  it('should have ACTIVE state', () => {
    expect(SaleState.ACTIVE).toBe('ACTIVE');
  });

  it('should have ENDED state', () => {
    expect(SaleState.ENDED).toBe('ENDED');
  });

  it('should have exactly 3 states', () => {
    const states = Object.values(SaleState);
    expect(states).toHaveLength(3);
    expect(states).toEqual(expect.arrayContaining(['UPCOMING', 'ACTIVE', 'ENDED']));
  });
});
