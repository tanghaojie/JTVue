const compileUtil = {
  getVal(expr, vm) {
    return expr.split('.').reduce((data, currentVal) => {
      return data[currentVal]
    }, vm.$data)
  },
  setVal(vm, expr, val) {
    return expr.split('.').reduce((data, currentVal, index, arr) => {
      return (data[currentVal] = val)
    }, vm.$data)
  },
  getContentVal(expr, vm) {
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getVal(args[1], vm)
    })
  },
  text(node, expr, vm) {
    let val
    if (expr.indexOf('{{') !== -1) {
      //
      val = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
        new Watcher(vm, args[1], () => {
          this.updater.textUpdater(node, this.getContentVal(expr, vm))
        })
        return this.getVal(args[1], vm)
      })
    } else {
      val = this.getVal(expr, vm)
    }
    this.updater.textUpdater(node, val)
  },
  html(node, expr, vm) {
    let val = this.getVal(expr, vm)
    new Watcher(vm, expr, newVal => {
      this.updater.htmlUpdater(node, newVal)
    })
    this.updater.htmlUpdater(node, val)
  },
  model(node, expr, vm) {
    const val = this.getVal(expr, vm)

    new Watcher(vm, expr, newVal => {
      this.updater.modelUpdater(node, newVal)
    })
    node.addEventListener(
      'input',
      e => {
        this.setVal(vm, expr, e.target.value)
      },
      false
    )
    this.updater.modelUpdater(node, val)
  },
  on(node, expr, vm, eventName) {
    let fn = vm.$options.methods && vm.$options.methods[expr]
    node.addEventListener(eventName, fn.bind(vm), false)
  },
  bind(node, expr, vm, attrName) {
    let attrVal = this.getVal(expr, vm)
    this.updater.attrUpdater(node, attrName, attrVal)
  },
  updater: {
    attrUpdater(node, attrName, attrVal) {
      node.setAttribute(attrName, attrVal)
    },
    modelUpdater(node, value) {
      node.value = value
    },
    textUpdater(node, value) {
      node.textContent = value
    },
    htmlUpdater(node, value) {
      node.innerHTML = value
    }
  }
}

class JTVue {
  constructor(options) {
    this.$el = options.el
    this.$data = options.data
    this.$options = options

    if (this.$el) {
      new Compile(this.$el, this)
    }
  }
}

class Compile {
  constructor(el, vm) {
    this.el = this.isElementNode(el) ? el : document.querySelector(el)
    this.vm = vm
    const fragment = this.nodeToFragment(this.el)

    this.compile(fragment)

    this.el.appendChild(fragment)
  }
  compile(fragment) {
    const childNodes = fragment.childNodes
    const childNodesArr = [...childNodes]
    childNodesArr.forEach(child => {
      if (this.isElementNode(child)) {
        this.compileElement(child)
      } else {
        this.compileText(child)
      }
      if (child.childNodes && child.childNodes.length) {
        this.compile(child)
      }
    })
  }
  compileElement(node) {
    const attributes = node.attributes
    const attributesArr = [...attributes]
    attributesArr.forEach(attr => {
      const { name, value } = attr

      if (this.isDirective(name)) {
        // v-    v-text/v-model/v-html
        const [, directive] = name.split('-')
        // v-on:click
        const [dirName, eventName] = directive.split(':')

        compileUtil[dirName] &&
          compileUtil[dirName](node, value, this.vm, eventName)
        node.removeAttribute('v-', directive)
      } else if (this.isEventName(name)) {
        // @
        let [, eventName] = name.split('@')
        compileUtil['on'](node, value, this.vm, eventName)
      }
    })
  }
  compileText(node) {
    const content = node.textContent
    if (/\{\{(.+?)\}\}/.test(content)) {
      compileUtil['text'](node, content, this.vm)
    }
  }
  isEventName(attrName) {
    return attrName.startsWith('@')
  }
  isDirective(attrName) {
    return attrName.startsWith('v-')
  }
  // Check node type is Element
  isElementNode(node) {
    return node.nodeType === 1
  }
  nodeToFragment(el) {
    const fragment = document.createDocumentFragment()
    let child
    while ((child = el.firstChild)) {
      fragment.appendChild(child)
    }
    return fragment
  }
}

class Observer {
  constructor(data) {
    this.observe(data)
  }
  observe(data) {
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(key => {
        this.defineReactive(data, key, data[key])
      })
    }
  }
  defineReactive(obj, key, value) {
    this.observe(value)
    const dep = new Dep()
    Object.defineProperty(obj, key, {
      get() {
        Dep.target && dep.addSub(Dep.target)
        return value
      },
      set: newVal => {
        if (newVal !== value) {
          this.observe(newVal)
          value = newVal
          dep.notify()
        }
      }
    })
  }
}

class Dep {
  constructor() {
    this.subs = []
  }
  addSub(watcher) {
    this.subs.push(watcher)
  }
  notify() {
    this.subs.forEach(w => w.update())
  }
}

class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm
    this.expr = expr
    this.cb = cb
    this.oldVal = this.getOldVal()
  }
  getOldVal() {
    Dep.target = this
    let oldVal = compileUtil.getVal(this.expr, this.vm)
    Dep.target = null
    return oldVal
  }
  update() {
    let newVal = compileUtil.getVal(this.expr, this.vm)
    if (newVal !== this.oldVal) {
      this.cb(newVal)
    }
  }
}
