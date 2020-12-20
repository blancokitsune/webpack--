const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

let ID = 0;
// 1.单独文件的解析
function createAsset(filename) {
  // 读取文件内容
  const content = fs.readFileSync(filename, "utf-8");
  // 使用babel提供的工具@babel/parser(原来的babylon)获取文件的ast结构
  const ast = parser.parse(content, {
    sourceType: "module",
  });

  // 记录当前模块的依赖情况(记录import啥东西了)
  const deps = [];
  // 使用babel提供的工具@babel/traverse(原来的traverse)获取每个import的细节
  traverse(ast, {
    ImportDeclaration({ node }) {
      deps.push(node.source.value);
    },
  });
  // 给每个模块分派一个唯一标识符
  const id = ID++;

  // 继续使用babel来获取经过语法转换的内容，比如es6变es4降维之类的
  const { code } = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });

  return { id, filename, deps, code };
}

// 2.获取从入口到所有的文件信息，理应从这里出发
// 此步完成就可以获取整个项目的一个关系对应了,也就是依赖图
function createGraph(entry) {
  // 1.获取入口文件的id，依赖，代码内容
  const mainAsset = createAsset(entry);

  // 2.记录所有文件，每有一个依赖的模块(文件)，就会添进来一个
  const queue = [mainAsset];
  for (const asset of queue) {
    const dirname = path.dirname(asset.filename);
    // 3.记录当前模块的依赖ID
    asset.mapping = {};

    // deps存储的是import解析出来的文件路径，如 [ './a.js' ]
    asset.deps.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath);
      const child = createAsset(absolutePath);
      // 将依赖的关系存起来，如入口文件的 mapping: { './a.js': 1 }
      asset.mapping[relativePath] = child.id;
      queue.push(child);
    });
  }

  // 返回程序的所有涉及文件(当前就只是js)
  return queue;
}

// 3.webpack打包出来的文件最后是一个IIFE立即调用函数,将已经处理后的文件信息作为参数传入,也就是绑定一下数据
function bundle(graph) {
  let modules = "";
  graph.forEach((mod) => {
    modules += `${mod.id}: [
      function(require, module, exports){
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ],`;
  });

  const result = `
    (function(modules){
      function require(id){
        const [fn, mapping] = modules[id];
        
        function  localRequire(relativePath){
          return require(mapping[relativePath])
        }

        const module = {exports: {}};
        fn(localRequire, module, module.exports);

        return module.exports;
      }
      require(0)
    })({${modules}})
  `;

  return result;
}

const graph = createGraph("./src/index.js");
const result = bundle(graph);

console.log(result);
