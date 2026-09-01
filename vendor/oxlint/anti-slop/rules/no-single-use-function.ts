import { defineRule } from '@oxlint/plugins';
import type { ESTree, Reference, Variable } from '@oxlint/plugins';

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

function isSimpleExpression(
    node: ESTree.Node,
    visitorKeys: Readonly<Record<string, readonly string[]>>
): boolean {
    if (
        node.type === 'Identifier' ||
        node.type === 'ThisExpression' ||
        node.type === 'BooleanLiteral' ||
        node.type === 'NullLiteral' ||
        node.type === 'NumericLiteral' ||
        node.type === 'StringLiteral' ||
        node.type === 'BigIntLiteral' ||
        node.type === 'RegExpLiteral' ||
        node.type === 'TemplateLiteral'
    ) {
        return true;
    }

    if (
        node.type === 'ChainExpression' ||
        node.type === 'MemberExpression' ||
        node.type === 'StaticMemberExpression' ||
        node.type === 'ComputedMemberExpression' ||
        node.type === 'CallExpression' ||
        node.type === 'NewExpression' ||
        node.type === 'LogicalExpression' ||
        node.type === 'ConditionalExpression'
    ) {
        return (visitorKeys[node.type] ?? []).every((key) => {
            const child = (node as unknown as Record<string, unknown>)[key];
            if (Array.isArray(child)) {
                return child.every(
                    (item) =>
                        item === null ||
                        typeof item !== 'object' ||
                        !('type' in item) ||
                        isSimpleExpression(item as ESTree.Node, visitorKeys)
                );
            }
            return (
                child === null ||
                typeof child !== 'object' ||
                !('type' in child) ||
                isSimpleExpression(child as ESTree.Node, visitorKeys)
            );
        });
    }

    return false;
}

function containsParameterReference(
    node: ESTree.Node,
    parameterNames: ReadonlySet<string>,
    visitorKeys: Readonly<Record<string, readonly string[]>>
): boolean {
    if (node.type === 'Identifier' && parameterNames.has(node.name)) return true;

    return (visitorKeys[node.type] ?? []).some((key) => {
        const child = (node as unknown as Record<string, unknown>)[key];
        if (Array.isArray(child)) {
            return child.some(
                (item) =>
                    item !== null &&
                    typeof item === 'object' &&
                    'type' in item &&
                    containsParameterReference(item as ESTree.Node, parameterNames, visitorKeys)
            );
        }
        return (
            child !== null &&
            typeof child === 'object' &&
            'type' in child &&
            containsParameterReference(child as ESTree.Node, parameterNames, visitorKeys)
        );
    });
}

function parameterNames(node: FunctionNode): Set<string> {
    const names = new Set<string>();
    for (const parameter of node.params) {
        let current: ESTree.ParamPattern = parameter;
        while (
            current.type === 'TSParameterProperty' ||
            current.type === 'AssignmentPattern' ||
            current.type === 'RestElement'
        ) {
            current =
                current.type === 'TSParameterProperty'
                    ? current.parameter
                    : current.type === 'AssignmentPattern'
                      ? current.left
                      : current.argument;
        }
        if (current.type === 'Identifier') names.add(current.name);
    }
    return names;
}

function getFunctionVariable(
    node: FunctionNode,
    sourceCode: { getDeclaredVariables(node: ESTree.Node): Variable[] }
): Variable | null {
    const declaration =
        node.type === 'FunctionDeclaration'
            ? node
            : node.parent.type === 'VariableDeclarator'
              ? node.parent
              : null;
    return declaration === null ? null : (sourceCode.getDeclaredVariables(declaration)[0] ?? null);
}

function isExported(node: FunctionNode, ancestors: ESTree.Node[]): boolean {
    if (node.type === 'FunctionDeclaration') {
        return ancestors.some(
            (ancestor) =>
                ancestor.type === 'ExportNamedDeclaration' ||
                ancestor.type === 'ExportDefaultDeclaration'
        );
    }

    return ancestors.some((ancestor) => ancestor.type === 'ExportNamedDeclaration');
}

function isDirectCall(reference: Reference): boolean {
    return (
        reference.identifier.parent.type === 'CallExpression' &&
        reference.identifier.parent.callee === reference.identifier
    );
}

function isCandidate(
    node: FunctionNode,
    sourceCode: {
        getDeclaredVariables(node: ESTree.Node): Variable[];
        getAncestors(node: ESTree.Node): ESTree.Node[];
        visitorKeys: Readonly<Record<string, readonly string[]>>;
    }
): boolean {
    if (node.async || node.params.length === 0 || isExported(node, sourceCode.getAncestors(node))) {
        return false;
    }

    const body = node.body;
    const returned =
        body.type === 'BlockStatement'
            ? body.body.length === 1 && body.body[0]?.type === 'ReturnStatement'
                ? body.body[0].argument
                : null
            : body;
    if (returned === null || !isSimpleExpression(returned, sourceCode.visitorKeys)) return false;

    const names = parameterNames(node);
    if (!containsParameterReference(returned, names, sourceCode.visitorKeys)) return false;

    const variable = getFunctionVariable(node, sourceCode);
    if (variable === null) return false;

    const reads = variable.references.filter((reference) => reference.isRead());
    return reads.length === 1 && isDirectCall(reads[0]);
}

/** Flag private one-use wrappers that should normally be inlined at their call site. */
export const noSingleUseFunctionRule = defineRule({
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow private one-use functions that only wrap a simple expression; inline them unless they own a real rule or boundary.',
        },
        messages: {
            singleUseFunction:
                'Inline this private one-use function. Keep a helper only when its name owns a domain rule, boundary, lifecycle, policy, or other meaningful contract.',
        },
    },
    createOnce(context) {
        const checkFunction = (node: FunctionNode) => {
            if (isCandidate(node, context.sourceCode)) {
                context.report({ node, messageId: 'singleUseFunction' });
            }
        };

        return {
            ArrowFunctionExpression: checkFunction,
            FunctionDeclaration: checkFunction,
            FunctionExpression: checkFunction,
        };
    },
});
