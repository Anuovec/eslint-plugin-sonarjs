/*
 * eslint-plugin-sonarjs
 * Copyright (C) 2018-2021 SonarSource SA
 * mailto:info AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
// https://jira.sonarsource.com/browse/RSPEC-1488
import { TSESLint, TSESTree } from '@typescript-eslint/experimental-utils';
import { Rule } from '../utils/types';
import {
  isReturnStatement,
  isThrowStatement,
  isIdentifier,
  isVariableDeclaration,
} from '../utils/nodes';

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
  },
  create(context: Rule.RuleContext) {
    return {
      BlockStatement(node: TSESTree.Node) {
        processStatements((node as TSESTree.BlockStatement).body);
      },
      SwitchCase(node: TSESTree.Node) {
        processStatements((node as TSESTree.SwitchCase).consequent);
      },
    };

    function processStatements(statements: TSESTree.Statement[]) {
      if (statements.length > 1) {
        const last = statements[statements.length - 1];
        const returnedIdentifier = getOnlyReturnedVariable(last);

        const lastButOne = statements[statements.length - 2];
        const declaredIdentifier = getOnlyDeclaredVariable(lastButOne);

        if (returnedIdentifier && declaredIdentifier) {
          const sameVariable = getVariables(context).find(variable => {
            return (
              variable.references.find(ref => ref.identifier === returnedIdentifier) !==
                undefined &&
              variable.references.find(ref => ref.identifier === declaredIdentifier.id) !==
                undefined
            );
          });

          // there must be only one "read" - in `return` or `throw`
          if (sameVariable && sameVariable.references.filter(ref => ref.isRead()).length === 1) {
            context.report({
              message: formatMessage(last, returnedIdentifier.name),
              node: declaredIdentifier.init,
              fix: fixer => fix(fixer, last, lastButOne, declaredIdentifier.init),
            });
          }
        }
      }
    }

    function fix(
      fixer: TSESLint.RuleFixer,
      last: TSESTree.Statement,
      lastButOne: TSESTree.Statement,
      expression: TSESTree.Expression,
    ): any {
      const throwOrReturnKeyword = context.getSourceCode().getFirstToken(last);

      if (lastButOne.range && last.range && throwOrReturnKeyword) {
        const expressionText = context.getSourceCode().getText(expression);
        const fixedRangeStart = lastButOne.range[0];
        const fixedRangeEnd = last.range[1];
        const semicolonToken = context.getSourceCode().getLastToken(last);
        const semicolon = semicolonToken && semicolonToken.value === ';' ? ';' : '';
        return [
          fixer.removeRange([fixedRangeStart, fixedRangeEnd]),
          fixer.insertTextAfterRange(
            [1, fixedRangeStart],
            `${throwOrReturnKeyword.value} ${expressionText}${semicolon}`,
          ),
        ];
      } else {
        return null;
      }
    }

    function getOnlyReturnedVariable(node: TSESTree.Statement) {
      return (isReturnStatement(node) || isThrowStatement(node)) &&
        node.argument &&
        isIdentifier(node.argument)
        ? node.argument
        : undefined;
    }

    function getOnlyDeclaredVariable(node: TSESTree.Statement) {
      if (isVariableDeclaration(node) && node.declarations.length === 1) {
        const { id, init } = node.declarations[0];
        if (isIdentifier(id) && init) {
          return { id, init };
        }
      }
      return undefined;
    }

    function formatMessage(node: TSESTree.Node, variable: string) {
      const action = isReturnStatement(node) ? 'return' : 'throw';
      return `Immediately ${action} this expression instead of assigning it to the temporary variable "${variable}".`;
    }

    function getVariables(context: Rule.RuleContext) {
      const { variableScope, variables: currentScopeVariables } = context.getScope();
      if (variableScope === context.getScope()) {
        return currentScopeVariables;
      } else {
        return currentScopeVariables.concat(variableScope.variables);
      }
    }
  },
};

export = rule;
