import base from './eslint.config.mjs';
import regexp from 'eslint-plugin-regexp';
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import sonarjs from 'eslint-plugin-sonarjs';
import n from 'eslint-plugin-n';
export default [
  ...base,
  regexp.configs['flat/recommended'],
  { files: ['**/*.ts','**/*.tsx'], plugins: { '@eslint-community/eslint-comments': comments, sonarjs, n },
    rules: {
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-aggregating-enable': 'error',
      '@eslint-community/eslint-comments/no-duplicate-disable': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-element-overwrite': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-use-of-empty-return-value': 'error',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'sonarjs/prefer-single-boolean-return': 'error',
      'sonarjs/no-ignored-return': 'error',
      'sonarjs/no-gratuitous-expressions': 'error',
      'sonarjs/no-empty-collection': 'error',
      'sonarjs/no-unused-collection': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-nested-switch': 'error',
      'sonarjs/no-same-line-conditional': 'error',
      'sonarjs/non-existent-operator': 'error',
      'sonarjs/no-dead-store': 'error',
      'n/no-deprecated-api': 'error',
      'n/no-sync': 'off',
      'n/no-process-exit': 'error',
    } },
];
