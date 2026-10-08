module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const dbMethods = ['one', 'all', 'run', 'tx'];

  // Add await to one(), all(), run(), tx()
  root.find(j.CallExpression, {
    callee: { name: (name) => dbMethods.includes(name) }
  }).forEach(path => {
    if (path.parentPath.value.type !== 'AwaitExpression') {
      j(path).replaceWith(j.awaitExpression(path.node));
    }
  });

  // Mark enclosing functions as async
  let madeChanges = true;
  while (madeChanges) {
    madeChanges = false;
    root.find(j.AwaitExpression).forEach(path => {
      let parent = path.parentPath;
      while (parent) {
        if (
          j.FunctionDeclaration.check(parent.node) ||
          j.FunctionExpression.check(parent.node) ||
          j.ArrowFunctionExpression.check(parent.node) ||
          j.ObjectMethod.check(parent.node)
        ) {
          if (!parent.node.async) {
            parent.node.async = true;
            madeChanges = true;
          }
          break;
        }
        parent = parent.parentPath;
      }
    });
  }

  // Convert forEach to for...of
  root.find(j.CallExpression, {
    callee: { property: { name: 'forEach' } }
  }).forEach(path => {
    const callback = path.node.arguments[0];
    if (callback && callback.async) {
      const arrayNode = path.node.callee.object;
      const paramName = callback.params[0] && callback.params[0].type === 'Identifier' ? callback.params[0].name : 'item';
      let bodyNode = callback.body;
      if (bodyNode.type !== 'BlockStatement') {
        bodyNode = j.blockStatement([j.expressionStatement(bodyNode)]);
      }
      
      const forOf = j.forOfStatement(
        j.variableDeclaration('const', [j.variableDeclarator(j.identifier(paramName), null)]),
        arrayNode,
        bodyNode
      );
      
      if (path.parentPath.node.type === 'ExpressionStatement') {
        j(path.parentPath).replaceWith(forOf);
      }
    }
  });

  // Convert map to await Promise.all
  root.find(j.CallExpression, {
    callee: { property: { name: 'map' } }
  }).forEach(path => {
    const callback = path.node.arguments[0];
    if (callback && callback.async) {
      if (path.parentPath.node.type === 'CallExpression' && 
          path.parentPath.node.callee.object && path.parentPath.node.callee.object.name === 'Promise') {
        return;
      }
      if (path.parentPath.node.type === 'AwaitExpression') {
        // already awaited, just wrap inner in Promise.all
        j(path).replaceWith(
          j.callExpression(j.memberExpression(j.identifier('Promise'), j.identifier('all')), [path.node])
        );
      } else {
        const promiseAll = j.awaitExpression(
          j.callExpression(j.memberExpression(j.identifier('Promise'), j.identifier('all')), [path.node])
        );
        j(path).replaceWith(promiseAll);
      }
    }
  });

  return root.toSource();
};
