/**
 * Duplicate Detection for Transcription Chunks
 * Removes overlapping content between adjacent chunks
 * EXACT PORT from backend: BrobyVets/backend/src/modules/transcription/duplicate-detector.ts
 */

class DuplicateDetector {
  static SIMILARITY_THRESHOLD = 0.85;

  /**
   * Remove duplicate content from adjacent transcript chunks
   * @param {string[]} transcripts - Array of transcription strings
   * @returns {string} - Cleaned combined transcription
   */
  static cleanDuplicates(transcripts) {
    if (!transcripts || transcripts.length === 0) {
      return '';
    }

    const cleaned = [transcripts[0]];

    for (let i = 1; i < transcripts.length; i++) {
      const current = transcripts[i];
      const previous = cleaned[cleaned.length - 1];

      // Skip empty segments
      if (!current?.trim()) {
        continue;
      }

      // Check for similarity
      const similarity = this.calculateSimilarity(previous, current);

      if (similarity > this.SIMILARITY_THRESHOLD) {
        // Find overlapping part
        const overlap = this.findOverlap(previous, current);

        if (overlap.endIndex > 0 && overlap.endIndex < current.length) {
          // Add only non-overlapping part
          const newContent = current.substring(overlap.endIndex).trim();
          if (newContent) {
            cleaned.push(newContent);
          }
        } else if (current.length > previous.length) {
          // Replace with longer version if mostly duplicate
          cleaned[cleaned.length - 1] = current;
        }
        // Otherwise skip as it's duplicate
      } else {
        // Not similar enough, add whole segment
        cleaned.push(current);
      }
    }

    const result = cleaned.join(' ').replace(/\s+/g, ' ').trim();

    console.log('🔍 Duplicate detection complete:', {
      originalChunks: transcripts.length,
      cleanedChunks: cleaned.length,
      removedChunks: transcripts.length - cleaned.length
    });

    return result;
  }

  /**
   * Calculate similarity ratio between two strings
   * @param {string} str1
   * @param {string} str2
   * @returns {number} - Similarity score (0-1)
   */
  static calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Find overlapping content between two strings
   * @param {string} str1
   * @param {string} str2
   * @returns {{startIndex: number, endIndex: number}}
   */
  static findOverlap(str1, str2) {
    const minOverlapLength = 20; // Minimum characters to consider overlap
    let bestMatch = { startIndex: -1, endIndex: 0, length: 0 };

    // Try to find str1's ending in str2's beginning
    for (let i = Math.min(str1.length, str2.length); i >= minOverlapLength; i--) {
      const ending = str1.substring(str1.length - i);
      const beginning = str2.substring(0, i);

      if (this.fuzzyMatch(ending, beginning)) {
        bestMatch = { startIndex: 0, endIndex: i, length: i };
        break;
      }
    }

    return bestMatch;
  }

  /**
   * Fuzzy string matching allowing for minor differences
   * @param {string} str1
   * @param {string} str2
   * @returns {boolean}
   */
  static fuzzyMatch(str1, str2) {
    if (str1.length !== str2.length) return false;

    let differences = 0;
    const maxDifferences = Math.floor(str1.length * 0.1); // Allow 10% difference

    for (let i = 0; i < str1.length; i++) {
      if (str1[i] !== str2[i]) {
        differences++;
        if (differences > maxDifferences) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1
   * @param {string} str2
   * @returns {number} - Edit distance
   */
  static levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Remove filler words aggressively
   * @param {string} text - Input text
   * @returns {string} - Cleaned text
   */
  static removeFillersAggressive(text) {
    // All possible filler words and sounds
    const fillers = [
      'um', 'uh', 'er', 'mmm', 'ah', 'eh', 'uhh', 'hmm', 'umm',
      'uhm', 'erm', 'ahh', 'ehh', 'mmh', 'mhm', 'aha', 'oh',
      'like', 'you know', 'I mean', 'actually', 'basically',
      'sort of', 'kind of', 'you see', 'right'
    ];

    let cleaned = text;

    // Remove filler words with word boundaries
    fillers.forEach(filler => {
      const pattern = new RegExp(`\\b${filler}\\b`, 'gi');
      cleaned = cleaned.replace(pattern, '');
    });

    // Remove stutters (repeated words)
    cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Remove standalone punctuation
    cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');

    return cleaned;
  }
}

// Make DuplicateDetector available globally
if (typeof window !== 'undefined') {
  window.DuplicateDetector = DuplicateDetector;
}
