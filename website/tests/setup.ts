import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';

// Mock scrollTo since happy-dom does not implement it
window.scrollTo = vi.fn();

// Mock URL.createObjectURL and URL.revokeObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-object-url');
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
