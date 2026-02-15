import { extractSkuFromKey } from '../../src/infrastructure/scheduling/extract-sku';

describe('extractSkuFromKey', () => {
  it('should extract SKU from valid key "sale:WIDGET-001:state"', () => {
    const result = extractSkuFromKey('sale:WIDGET-001:state');

    expect(result).toBe('WIDGET-001');
  });

  it('should return null for invalid format', () => {
    const result = extractSkuFromKey('invalid-key');

    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = extractSkuFromKey('');

    expect(result).toBeNull();
  });

  it('should return null for wrong prefix', () => {
    const result = extractSkuFromKey('product:WIDGET-001:state');

    expect(result).toBeNull();
  });

  it('should handle SKU with hyphens', () => {
    const result = extractSkuFromKey('sale:MY-SKU-123:state');

    expect(result).toBe('MY-SKU-123');
  });
});
