const SCRIPT_REGEXP = /src=('|")(.*(?=\1))/
const LINK_REGEXP = /href=('|")(.*(?=\1))/

function remove_style(all) {
  //https://css-tricks.com/snippets/javascript/remove-inline-styles/
  let i = all.length
  let j, is_hidden

  // Presentational attributes.
  let attr = [
    'align',
    'background',
    'bgcolor',
    'border',
    'cellpadding',
    'cellspacing',
    'color',
    'face',
    'height',
    'hspace',
    'marginheight',
    'marginwidth',
    'noshade',
    'nowrap',
    'valign',
    'vspace',
    'width',
    'vlink',
    'alink',
    'text',
    'link',
    'frame',
    'frameborder',
    'clear',
    'scrolling',
    'style'
  ]

  let attr_len = attr.length

  while (i--) {
    is_hidden = all[i].style.display === 'none'

    j = attr_len

    while (j--) {
      all[i].removeAttribute(attr[j])
    }

    // Re-hide display:none elements,
    // so they can be toggled via JS.
    if (is_hidden) {
      all[i].style.display = 'none'
      is_hidden = false
    }
  }
}

class Library {
  constructor() {
    if (Library.prototype.documentWriteBackup != undefined)
      throw SyntaxError('only one instance of FakeDocument is possible!')

    Library.prototype.documentWriteBackup = document.write
    Library.prototype.instance = this
    this.scripts = []
    this.links = []
    this.promises = []
  }

  addScript(link) {
    if (link instanceof Array) {
      this.scripts.push(...link)
    } else {
      this.scripts.push(link)
    }
    return this
  }

  add(str) {
    if (str.startsWith('<script')) {
      this.scripts.push(SCRIPT_REGEXP.exec(str)[2]) //get url
      return
    }
    if (str.startsWith('<link')) {
      this.links.push(str)
      return
    }
    console.error('strange document write' + str)
    return this
  }

  popScriptUrl() {
    if (this.scripts.length == 0) return null
    return this.scripts.shift()
  }

  *linkUrlIterator() {
    while (this.links.length != 0) {
      let match = LINK_REGEXP.exec(this.links.shift())
      yield match[2]
    }
  }

  loadNext(body) {
    return new Promise(async (resolve) => {
      let script = this.popScriptUrl()
      if (script != null) {
        let scriptElem = document.createElement('script')
        scriptElem.src = script
        let promise = new Promise((localResolve) => {
          scriptElem.onload = () => {
            localResolve()
            // console.log('loaded: ' + script)
          }
          body.appendChild(scriptElem)
          // console.log('appended: ' + script)
        })
        await promise
        // console.log('promise concluded: ' + script)
        await this.loadNext(body)
      }
      resolve()
    })
  }

  write(str) {
    Library.prototype.instance.add(str)
  }

  init() {
    return new Promise(async (resolve, reject) => {
      try {
        this.start()
        let body = document.getElementsByTagName('body')[0]
        let head = document.getElementsByTagName('head')[0]

        await this.loadNext(body)

        for (const link of this.linkUrlIterator()) {
          let linkElem = document.createElement('link')
          linkElem.href = link
          linkElem.rel = 'stylesheet'
          this.promises.push(
            new Promise((localResolve) => {
              linkElem.onload = () => {
                localResolve('link' + link)
              }
              head.appendChild(linkElem)
            })
          )
        }

        for (let i = 0; i < this.promises.length; i++) {
          await this.promises[i]
        }
        resolve()
      } catch (error) {
        reject(error)
      } finally {
        this.restore()
      }
    })
  }

  start() {
    document.write = this.write
  }

  restore() {
    document.write = Library.documentWriteBackup
  }
}

const LibraryDelayer = {
  install: (app, options) => {
    const library = new Library()
    const libraryList = options.libraries

    const load = (lib, callback) => {
      let scripts = libraryList[lib]
      if (scripts !== undefined) {
        library
          .addScript(scripts)
          .init()
          .then(() => {
            delete libraryList[lib]
            callback()
          })
      } else {
        callback()
      }
    }

    const getRidOfInlineStyle = (id, elements) => {
      if (id == undefined) {
        return
      }

      let set = document.getElementById(id)
      remove_style(set)

      if (elements == undefined) {
        return
      }

      set = set.getElementsByTagName(elements)
      remove_style(set)
    }

    const library_delayer = {
      load,
      getRidOfInlineStyle
    }

    app.provide('library_delayer', library_delayer)
  }
}

export { remove_style, Library, LibraryDelayer }
