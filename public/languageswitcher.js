class LanguageSwitcher extends HTMLElement {

/*
  static observedAttributes = ["currentLanguage"];
*/

  static langAttribute = 'data-lang'

  constructor() {
    super();
    this.defaultLanguage = 'en'
    this.translationFile = './translations.json'
    this.langAttribute = 'lang'
    this.currentLanguage = this.defaultLanguage
    this.root = document.querySelector(':root')
    this.languages = {}
    this.listeners = [
      'animationcancel', 'animationend', 'animationiteration', 'animationstart',
      'audioprocess', 'canplay', 'canplaythrough', 'complete',
      'auxclick', 'beforeinput', 'blur', 'change', 'click', 'close', 
      'compositionend', 'compositionstart', 'compositionupdate', 
      'contentvisibilityautostatechange', 'contextmenu',
      'copy', 'cuechange', 'cut', 'dblclick', 'drag', 'dragend', 'dragenter',
      'dragexit', 'dragleave', 'dragover', 'dragstart', 'drop', 'durationchange',
      'emptied', 'ended', 'error', 'focus', 'focusin', 'focusout', 
      'fullscreenchange', 'fullscreenerror', 'gotpointercapture', 'input', 'keydown',
      'keypress', 'keyup', 'load', 'loadeddata', 'loadedmetadata', 'loadend', 'loadstart',
      'lostpointercapture', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout',
      'mouseover', 'mouseup', 'paste', 'pause', 'pointercancel', 'pointerdown', 
      'pointerenter', 'pointerleave', 'pointermove', 'pointerout', 'pointerover', 'pointerup', 
      'play', 'playing', 'progress', 'ratechange', 'reset', 'resize', 'scroll', 'scrollend',
      'securitypolicyviolation', 'seeked', 'seeking', 'stalled', 'suspend', 'timeupdate',
      'touchcancel', 'touchend', 'touchmove', 'touchstart',
      'transitioncancel', 'transitionend', 'transitionrun', 'transitionstart',
      'volumechange', 'waiting', 'wheel']
    this.buttonTypes = ['button', 'submit', 'reset']
    this.labelElements = ['optgroup', 'option']
    // this.valueElements = ['data']
    this.translatableAttributes = ['alt', 'cite', 'label', 'placeholder', 'title', 'value']
    this.translations = {}
  }
  async connectedCallback() {
    try {
      const resp = await fetch(this.translationFile)
      this.translations = await resp.json()
      const translatables = document.querySelectorAll('[lang]')
      for (const elem of translatables) {
        this.translateElement(elem)
      }
    }
    catch(e) {
      console.error(e)
      return false
    }
    const switcher = this;
    switcher.classList.add('language-switcher')
    const params = new URLSearchParams(document.location.search)
    const newLanguage = params.get('lang')
    if (newLanguage in this.languages) {
      this.currentLanguage = newLanguage
    }
    this.root.setAttribute(this.langAttribute, this.currentLanguage)
    
    const langSwitcher = document.createElement('ul')
    for (const lang in this.languages) {
      const li = document.createElement('li')
      li.textContent = lang
      if (lang == this.currentLanguage) {
        li.className = 'selected'
      }
      li.onclick = (e) => {
        params.set('lang', lang)
        try { // won't work with file:// URIs
          history.replaceState({lang}, '', './?' + params.toString())
        } catch(e) { }
        const prev = switcher.querySelector('li.selected')
        prev.classList.remove('selected')
        li.classList.add('selected')
        this.setLanguage(lang)
      }
      langSwitcher.appendChild(li)
    }
    switcher.appendChild(langSwitcher)
    const style = document.createElement("style")
    style.textContent = `
*[${this.langAttribute}]:not([${this.langAttribute}="${this.currentLanguage}"]) {
 display: none;
}
`
    switcher.appendChild(style)
    for (const stylesheet of document.styleSheets) {
      for (let i = 0; i < stylesheet.cssRules.length; i++) {
        const rule = stylesheet.cssRules[i]
        if (rule.selectorText == `[${this.langAttribute}]:not([${this.langAttribute}="${this.currentLanguage}"])`) {
          this.cssRuleIndex = i
          this.css = stylesheet
          break
        }
      }
    }
    window.addEventListener("popstate", (event) => {
      const lang = event.state?.currentLanguage
      if (lang) {
        this.setLanguage(lang)
      }
    })
    const mutationConfig = { attributes: true, childList: true, subtree: true }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type == 'childList') {
          const addedNodes = mutation.addedNodes
          for (const node of addedNodes) {
            if (node.nodeType == 1 && node.hasAttribute(this.langAttribute) && node.getAttribute(this.langAttribute) == this.defaultLanguage) {
              this.translateElement(node)
            }
          }
        }
        else if (mutation.type == 'attributes' && mutation.target.hasAttribute(this.langAttribute)) {
          // this.translateElement(mutation.target)
        }
      }
    })
    observer.observe(document.body, mutationConfig)
  }

/*
  attributeChangedCallback(name, oldValue, newValue) {
    console.log(name, newValue, oldValue)
    if (name == 'currentLanguage') {
      setLanguage(newValue)
    }
  }
*/

  translateElement(elem) {
    this.languages[elem.getAttribute(this.langAttribute)] = true
    if (elem == this.root) {
      return false
    }
    let key = elem.textContent
    if (elem.tagName.toLowerCase() == 'input' && this.buttonTypes.includes(elem.type.toLowerCase())) {
      key = elem.value
    }
    if (this.labelElements.includes(elem.tagName.toLowerCase())) {
      key = elem.label || elem.textContent
    }
    if (this.translations[key] == undefined) {
      console.warn('No translations for ', key)
      elem.removeAttribute('lang') // not translated
    }
    else {
      for (const lang in this.translations[key]) {
        this.languages[lang] = true
        if (elem.getAttribute(this.langAttribute) == lang) {
          continue
        }
        const copy = elem.cloneNode()
        for (const listener of this.listeners) {
          if (elem[`on${listener}`]) copy[`on${listener}`] = elem[`on${listener}`]
        }
        if (elem.tagName.toLowerCase() == 'input' && this.buttonTypes.includes(elem.type.toLowerCase())) {
          copy.value = this.translations[key][lang]
        }
        else if (this.labelElements.includes(elem.tagName.toLowerCase())) {
          copy.label = this.translations[key][lang]
        }
        else {
          copy.innerHTML = this.translations[key][lang]
        }
        copy.setAttribute(this.langAttribute, lang)
        elem.setAttribute(this.langAttribute, elem.getAttribute(this.langAttribute))
        elem.after(copy)
        for (const attr of this.translatableAttributes) {
          const attrKey = elem[attr]
          if (this.translations[attrKey] !== undefined) {
            copy[attr] = this.translations[attrKey][lang]
          }
        }
      }
    }
  }

  setLanguage(lang) {
    // console.log('setting new language', lang)
    this.currentLanguage = lang
    this.root.setAttribute(this.langAttribute, lang)
    if (this.css && (this.cssRuleIndex >=0)) {
      this.css.deleteRule(this.cssRuleIndex)
      this.css.insertRule(`[${this.langAttribute}]:not([${this.langAttribute}="${lang}"]) { display: none !important; }`, this.cssRuleIndex)
    }
    const opts = document.querySelectorAll(`option[${this.langAttribute}]:checked`)
    for (const opt of opts) {
     opt.selected = false
     const otherOpt = opt.parentNode.parentNode.querySelector(`option[${this.langAttribute}="${lang}"][value="${opt.value}"]`)
     if (otherOpt) {
      otherOpt.selected = "selected"
     }
    }
  }
}

customElements.define("language-switcher", LanguageSwitcher, {extends: 'nav'})