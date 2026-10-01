import { loadTokens, getAllTokens } from '../utils/token-loader';
import * as fs from 'fs';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('token-loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadTokens', () => {
    it('should parse valid JSON', () => {
      mockedFs.readFileSync.mockReturnValue('{"color": {"primary": "red"}}');
      const tokens = loadTokens('colors.json');
      expect(tokens).toEqual({"color": {"primary": "red"}});
    });

    it('should throw if file does not exist', () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      expect(() => loadTokens('nonexistent.json')).toThrow('File not found');
    });

    it('should throw if JSON is malformed', () => {
      mockedFs.readFileSync.mockReturnValue('{"invalid": }');
      expect(() => loadTokens('invalid.json')).toThrow();
    });
  });

  describe('getAllTokens', () => {
    it('should merge all tokens', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '{"color": "red"}';
        if (path.toString().includes('typography.json')) return '{"font": "sans"}';
        if (path.toString().includes('spacing.json')) return '{"space": "4px"}';
        if (path.toString().includes('shadows.json')) return '{"shadow": "1px"}';
        if (path.toString().includes('motion.json')) return '{"motion": "ease"}';
        if (path.toString().includes('borders.json')) return '{"border": "1px"}';
        if (path.toString().includes('z-index.json')) return '{"zIndex": 100}';
        if (path.toString().includes('opacity.json')) return '{"opacity": 0.5}';
        if (path.toString().includes('breakpoints.json')) return '{"breakpoint": "768px"}';
        if (path.toString().includes('toast.json')) return '{"toast": {"maxVisible": 5}}';
        return '{}';
      });

      const allTokens = getAllTokens();
      expect(allTokens).toEqual({
        "color": "red",
        "font": "sans",
        "space": "4px",
        "shadow": "1px",
        "motion": "ease",
        "border": "1px",
        "zIndex": 100,
        "opacity": 0.5,
        "breakpoint": "768px",
        "toast": { "maxVisible": 5 }
      });
    });

    it('should fail loudly when a required token file is missing', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('typography.json')) throw new Error('File not found');
        return '{}';
      });

      expect(() => getAllTokens()).toThrow(
        'Failed to load required token file "typography.json": File not found'
      );
    });

    it('should identify a required token file containing malformed JSON', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('typography.json')) return '{"invalid": }';
        return '{}';
      });

      expect(() => getAllTokens()).toThrow(
        /^Failed to load required token file "typography\.json":/
      );
    });

    it('should let later files override earlier keys via Object.assign', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) return '{"token": "from-colors"}';
        if (path.toString().includes('breakpoints.json')) return '{"token": "from-breakpoints"}';
        return '{}';
      });

      const allTokens = getAllTokens();

      expect(allTokens).toEqual({"token": "from-breakpoints"});
    });

    it('should stop reading after the first required file fails', () => {
      mockedFs.readFileSync.mockImplementation((path) => {
        if (path.toString().includes('colors.json')) throw new Error('File not found');
        return '{}';
      });

      expect(() => getAllTokens()).toThrow(
        'Failed to load required token file "colors.json": File not found'
      );
      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);
    });
  });
});
