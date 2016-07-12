define('cssobj', function () { 'use strict';

  /** IE ES3 need below polyfills:
   * Array.prototype.forEach
   * Array.prototype.indexOf
   * Array.prototype.map
   * Array.prototype.some
   * Array.prototype.reduce
   * Object.keys
   **/


  // using var as iteral to help optimize
  var KEY_ID = '$id'
  var KEY_ORDER = '$order'

  var TYPE_KEYFRAMES = 'keyframes'
  var TYPE_GROUP = 'group'

  var ARRAY = 'Array'
  var OBJECT = 'Object'


  var is = function (t, v) { return {}.toString.call(v).slice(8, -1) === t }
  var own = function (o, k) { return {}.hasOwnProperty.call(o, k) }
  var keys = Object.keys

  function isIterable (v) {
    return is(OBJECT, v) || is(ARRAY, v)
  }

  var reWrapperType = /keyframes|group/
  var reOneRule = /@(?:charset|import|namespace)\s*$/
    var reGroupRule = /^@(?:media|document|supports) /
    var reKeyFrame = /^@keyframes /
    var reAtRule = /^\s*@/
    var reClass = /:global\s*\(\s*((?:\.[A-Za-z0-9_-]+\s*)+)\s*\)|(\.)([!A-Za-z0-9_-]+)/g

  var random = (function () {
    var count = 0
    return function () {
      count++
      return '_' + Math.floor(Math.random() * Math.pow(2, 32)).toString(36) + count + '_'
    }
  })()

  // var _util = {
  //   is: is,
  //   own: own,
  //   random: random,
  //   getSelector: getSelector,
  //   getParent: getParent,
  //   findObj: findObj,
  //   arrayKV: arrayKV,
  //   strSugar: strSugar,
  //   strRepeat: strRepeat,
  //   splitComma: splitComma
  // }

  /**
   * convert simple Object into tree data
   *
   format:
   {"a":{"b":{"c":{"":["leaf 1"]}}},"abc":123, e:[2,3,4], f:null}
   *        1. every key is folder node
   *        2. "":[] is leaf node
   *        3. except leaf node, array value will return as is
   *        4. {abc:123} is shortcut for {abc:{"": [123]}}
   *
   * @param {object} d - simple object data
   * @param {object} opt - options {indent:String, prefix:String||Boolean, local:Boolean}
   * @param {function} [prop] - function(key,val){} to return {object} to merge into current
   * @param {array} [path] - array path represent root to parent
   * @returns {object} tree data object
   */
  function parseObj (d, opt, node) {
    node = node || {}
    if (is(ARRAY, d)) {
      return d.map(function (v, i) {
        return parseObj(v, opt, node[i] || {parent: node, src: d, index: i, value: d[i]})
      })
    }
    if (is(OBJECT, d)) {
      var children = node.children = node.children||{}
      var oldVal = node.oldVal = node.lastVal
      node.lastVal = {}
      node.prop = {}
      node.diff = {}
      if(d[KEY_ID]) opt._ref[d[KEY_ID]] = d
      var order = d[KEY_ORDER]|0
      var funcArr = []

      // array index don't have key,
      // fetch parent key as ruleNode
      var ruleNode = getParents(node, function(v) {
        return v.key
      }).pop()

      var parentRule = node.parentRule = getParents(node.parent, function(n) {
        return reWrapperType.test(n.type)
      }).pop() || null


      if(ruleNode) {
        var sel = ruleNode.key
        var groupRule = sel.match(reGroupRule)
        var keyFramesRule = sel.match(reKeyFrame)
        if(groupRule){
          node.type = TYPE_GROUP
          node.at = groupRule.pop()
          node.sel = splitComma(sel.replace(reGroupRule, '')).map(function(v) {
            return strSugar(v, [
              ['[><]', function (z) {
                return z == '>'
                  ? 'min-width:'
                  : 'max-width:'
              }]
            ])
          })

          var pPath = getParents(ruleNode, function(v) {
            return v.type==TYPE_GROUP
          }, 'sel')

          node.selText = localizeName(node.at + combinePath(pPath, '', ' and '), opt)

        } else if (keyFramesRule) {
          node.type = TYPE_KEYFRAMES
          node.at = keyFramesRule.pop()
          node.selText = sel
        } else if (reOneRule.test(sel)) {
          node.type = 'one'
        } else if (reAtRule.test(sel)) {
          node.type = 'at'
          node.selText = sel
        } else {
          node.selText = parentRule && parentRule.type==TYPE_KEYFRAMES
            ? sel
            : localizeName(''+combinePath(getParents(ruleNode, function(v) {
              return v.sel && !v.at
            }, 'sel'), '', ' ', true), opt)
        }

        if(node!==ruleNode) node.ruleNode = ruleNode

      }

      for (var k in d) {
        if (!own(d, k)) continue
        if (!isIterable(d[k]) || is(ARRAY, d[k]) && !isIterable(d[k][0])) {
          if(k.charAt(0)=='$') continue
          var r = function(_k) {
            parseProp(node, d, _k, opt)
          }
          order!=0
            ? funcArr.push([r, k])
            : r(k)
        } else {
          var haveOldChild = k in children
          var n = children[k] = parseObj(d[k], opt, extendObj(children, k, {parent: node, src: d, key: k, sel:splitComma(k), value: d[k]}))
          // it's new added node
          if(oldVal && !haveOldChild) arrayKV(opt._diff, 'added', n)
        }
      }

      // when it's second time visit node
      if(oldVal) {

        // children removed
        for(k in children) {
          if(!(k in d)) {
            arrayKV(opt._diff, 'removed', children[k])
            delete children[k]
          }
        }

        // prop changed
        var diffProp = function() {
          var newKeys = keys(node.lastVal)
          var removed = keys(oldVal).filter(function(x) { return newKeys.indexOf(x) < 0 })
          if(removed.length) node.diff.removed = removed
          if(keys(node.diff).length) arrayKV(opt._diff, 'changed', node)
        }
        order!=0
          ? funcArr.push([diffProp, null])
          : diffProp()
      }

      if(order) arrayKV(opt, '_order', {order:order, func:funcArr})
      return node
    }
    return node
  }

  function extendObj(obj, key, source) {
    obj[key] = obj[key]||{}
    for(var k in source) obj[key][k] = source[k]
    return obj[key]
  }

  function parseProp(node, d, key, opt) {
    var oldVal = node.oldVal
    var lastVal = node.lastVal

    var prev = oldVal && oldVal[key]

    ![].concat(d[key]).forEach(function (v) {
      // pass lastVal if it's function
      var val = is('Function', v)
        ? v(prev, node, opt)
        : v

      // only valid val can be lastVal
      if (isValidCSSValue(val)) {
        // push every val to prop
        arrayKV(node.prop, key, val)
        prev = lastVal[key] = val
      }
    })
    if(oldVal) {
      if(!(key in oldVal)) {
        arrayKV(node.diff, 'added', key)
      } else if (oldVal[key]!=lastVal[key]){
        arrayKV(node.diff, 'changed', key)
      }
    }
  }

  function getParents (node, test, key) {
    var p = node, path=[]
    while(p) {
      if(test(p)) path.unshift(key?p[key]:p)
      p = p.parent
    }
    return path
  }

  function arrayKV (obj, k, v, noMerge) {
    obj[k] = obj[k] || []
    obj[k] = obj[k].concat(noMerge ? [v] :v)
  }

  function strSugar (str, sugar) {
    return sugar.reduce(
      function (pre, cur) {
        return pre.replace(
          new RegExp('\\\\?('+ cur[0] +')', 'g'),
          function (m, z) {
            return m==z ? cur[1](z) : z
          }
        )
      },
      str
    )
  }

  function combinePath(array, prev, sep, rep) {
    return !array.length ? prev : array[0].reduce(function (result, value) {
      var str = prev ? prev + sep : prev
      if(rep){
        var isReplace = false
        var sugar = strSugar(value, [['&', function(z){
          isReplace=true
          return prev
        }]])
        str = isReplace ? sugar : str + sugar
      } else {
        str += value
      }
      return result.concat(combinePath( array.slice(1), str, sep, rep ))
    }, [])
  }

  function splitComma (str) {
    for (var c, i = 0, n = 0, prev = 0, d = []; c = str[i]; i++) {
      if (/[\(\[]/.test(c)) n++
      if (/[\)\]]/.test(c)) n--
      if (!n && c == ',') d.push(str.substring(prev, i)), prev = i + 1
    }
    return d.concat(str.substring(prev))
  }

  function localizeName (str, opt) {
    var NS = opt._localNames
    var replacer = function (match, global, dot, name) {
      if (global) {
        return global
      }
      if (name[0] === '!') {
        return dot + name.substr(1)
      }

      if (!opt.local) {
        NS[name] = name
      } else if (!NS[name]) {
        NS[name] = opt.prefix + name
      }

      return dot + NS[name]
    }

    return str.replace(reClass, replacer)
  }

  function isValidCSSValue (val) {
    return val || val === 0
  }

  function makeCSS (root, opt, recursive) {
    var str = []
    var walk = function(node) {
      if (!node) return ''
      if (is(ARRAY, node)) return node.map(function (v) {walk(v)})

      var postArr = []
      var children = node.children
      var isGroup = reWrapperType.test(node.type)

      if(isGroup) {
        str.push(node.selText+' {\n')
      }

      if(keys(node.lastVal).length) str.push(makeRule(node, opt))

      for(var c in children){
        if(c==='' || children[c].type==TYPE_GROUP) postArr.push(c)
        else walk(children[c])
      }

      if(isGroup) {
        str.push('}\n')
      }

      postArr.map(function(v) {
        walk(children[v])
      })

    }
    walk(root)
    return str.join('')
  }

  function makeRule (node, opt, declOnly) {
    var prop = node.prop

    var style = keys(prop).map(function(k) {

      var key = strSugar(k, [
        ['[A-Z]', function (z) { return '-' + z.toLowerCase() }]
      ])

      return prop[k].map(function(v) {
        if(reOneRule.test(k))
          return k + ' ' + v + ';\n'
        else
          return key + ': ' + applyPlugins(opt, 'value', v, k, node) + ';\n'
      }).join('')
    }).join('')

    if(declOnly) return style

    var sel = getParents(node, function(v) {
      return v.selText && !v.at
    }, 'selText').pop()

    return sel && !sel.at ? sel + ' {\n'+ style +'}\n' : style
  }

  function applyPlugins (opt, type) {
    var args = [].slice.call(arguments, 2)
    var plugin = opt.plugins[type]
    return !plugin ? args[0] : [].concat(plugin).reduce(
      function (pre, f) { return f.apply(null, [pre].concat(args)) },
      args.shift()
    )
  }

  function findNode (obj, root) {
    var found
    var walk = function (node) {
      if (is(ARRAY, node)) return node.some(walk)
      if (node.value == obj) return found = node
      for (var k in node.children) {
        if (found) return
        walk(node.children[k])
      }
    }
    walk(root)
    return found
  }

  function applyOrder(opt) {
    if(!opt._order) return
    opt._order
      .sort(function(a,b) {
        return a.order-b.order
      })
      .forEach(function(v) {
        v.func.forEach(function(f) {
          f[0](f[1])
        })
      })
    delete opt._order
  }

  function cssobj (obj, options, localNames) {
    options = options || {}

    var defaultOption = {
      local: true,
      diffOnly: false,
      plugins: {}
    }
    // set default options
    for (var i in defaultOption) {
      if(!(i in options)) options[i] = defaultOption[i]
    }

    options._events = {}
    // options._util = _util
    options.prefix = options.prefix || random()

    var ref = options._ref = {}
    var nameMap = options._localNames = localNames || {}

    var root = parseObj(obj, options)
    applyOrder(options)

    options._root = root

    // var d=testObj[1]['.p']
    // console.log(1111, d, findObj(d, root))

    var updater = function (newObj, data) {

      result.diff = options._diff = {}
      options._data = data||{}

      var newCSS=''

      parseObj(newObj||obj, options, root)
      applyOrder(options)

      if(!options.diffOnly) newCSS = result.css = makeCSS(root, options, true)

      var cb = options._events['update']
      cb && newCSS && cb.forEach(function (v) {v(newCSS, options)})
      return newCSS
    }

    var result = {
      root: root,
      obj: obj,
      css: makeCSS(root, options, true),
      map: nameMap,
      ref: ref,
      update: updater,
      options: options,
      on: function (eventName, cb) {
        arrayKV(options._events, eventName, cb)
      },
      off: function (eventName, cb) {
        var i, arr = options._events[eventName]
        if (!arr) return
        if (!cb) return arr = []
        if ((i = arr.indexOf(cb)) > -1) arr.splice(i, 1)
      }
    }

    // root[0].children._p.prop._color= function(){return 'bluesdfsdf'}
    // console.log(root, makeCSS(root[0].children['_p'], options))
    applyPlugins(options, 'post', result)
    return result
  }

  cssobj.findNode = findNode
  cssobj.makeRule = makeRule

  return cssobj;

});