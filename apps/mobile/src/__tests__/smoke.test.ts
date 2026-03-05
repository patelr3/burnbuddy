describe('Smoke test', () => {
  it('should pass a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to Jest globals', () => {
    expect(jest).toBeDefined();
    expect(typeof jest.fn).toBe('function');
  });
});
