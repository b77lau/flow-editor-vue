import { pluck } from '../../Util'
import AbstractShape from './AbstractShape'
import UIObject from './UIObject'
import ORYX_Log from '../Log'
import ORYX_Utils from '../Utils'
import ORYX_Config from '../CONFIG'
import Shape from './Shape'
import Node from './Node'
import Edge from './Edge'
import StencilSet from './StencilSet/index'

/**
 * @class Oryx canvas.
 * @extends ORYX.Core.AbstractShape
 *
 */
export default class Canvas extends AbstractShape {
  /** @lends ORYX.Core.Canvas.prototype */

  /**
   * Defines the current zoom level
   */
  zoomLevel = 1

  constructor (options, stencil, facade) {
    // arguments.callee.$.construct.apply(this, arguments);
    super(...arguments)

    if (!(options && options.width && options.height)) {
      ORYX_Log.fatal('Canvas is missing mandatory parameters options.width and options.height.')
      return
    }
    this.facade = facade
    // TODO: set document resource id
    this.resourceId = options.id
    this.nodes = []
    this.edges = []

    // Row highlighting states
    this.colHighlightState = 0
    this.colHighlightEnabled = false

    // init svg document
    this.rootNode = ORYX_Utils.graft('http://www.w3.org/2000/svg', options.parentNode,
      ['svg', { id: this.id, width: options.width, height: options.height },
        ['defs', {}]
      ])

    this.rootNode.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
    this.rootNode.setAttribute('xmlns:svg', 'http://www.w3.org/2000/svg')

    this._htmlContainer = ORYX_Utils.graft('http://www.w3.org/1999/xhtml', options.parentNode,
      ['div', { id: 'oryx_canvas_htmlContainer', style: 'position:absolute; top:5px' }])

    // Additional SVG-node BELOW the stencils to allow underlays (if that is even a word) by plugins
    this.underlayNode = ORYX_Utils.graft('http://www.w3.org/2000/svg', this.rootNode,
      ['svg', { id: 'underlay-container' }])

    // Create 2 svg-elements in the svg-container
    this.columnHightlight1 = ORYX_Utils.graft('http://www.w3.org/2000/svg', this.underlayNode,
      ['rect', {
        x: 0,
        width: ORYX_Config.FORM_ROW_WIDTH + 35,
        height: '100%',
        style: 'fill: #fff6d5',
        visibility: 'hidden'
      }])

    this.columnHightlight2 = ORYX_Utils.graft('http://www.w3.org/2000/svg', this.underlayNode,
      ['rect', {
        x: ORYX_Config.FORM_ROW_WIDTH + 35,
        width: ORYX_Config.FORM_ROW_WIDTH + 25,
        height: '100%',
        style: 'fill: #fff6d5',
        visibility: 'hidden'
      }])

    this.node = ORYX_Utils.graft('http://www.w3.org/2000/svg', this.rootNode,
      ['g', {},
        ['g', { 'class': 'stencils' },
          ['g', { 'class': 'me' }],
          ['g', { 'class': 'children' }],
          ['g', { 'class': 'edge' }]
        ],
        ['g', { 'class': 'svgcontainer' }]
      ])

    this.node.setAttributeNS(null, 'stroke', 'none')
    this.node.setAttributeNS(null, 'font-family', 'Verdana, sans-serif')
    this.node.setAttributeNS(null, 'font-size-adjust', 'none')
    this.node.setAttributeNS(null, 'font-style', 'normal')
    this.node.setAttributeNS(null, 'font-variant', 'normal')
    this.node.setAttributeNS(null, 'font-weight', 'normal')
    this.node.setAttributeNS(null, 'line-heigth', 'normal')
    this.node.setAttributeNS(null, 'font-size', ORYX_Config.LABEL_DEFAULT_LINE_HEIGHT)
    this.bounds.set(0, 0, options.width, options.height)

    this.addEventHandlers(this.rootNode.parentNode)

    // disable context menu
    this.rootNode.oncontextmenu = () => {
      this.eventHandlerCallback({ type: 'oncontextmenu' })
      return false
    }
  }

  focus () {}

  setHightlightState (state) {
    if (this.colHighlightEnabled && this.colHighlightState !== state) {
      if (state === 0) {
        this.columnHightlight1.setAttribute('visibility', 'hidden')
        this.columnHightlight2.setAttribute('visibility', 'hidden')
      } else if (state === 1) {
        this.columnHightlight1.setAttribute('visibility', 'visible')
        this.columnHightlight2.setAttribute('visibility', 'hidden')
      } else if (state === 2) {
        this.columnHightlight1.setAttribute('visibility', 'hidden')
        this.columnHightlight2.setAttribute('visibility', 'visible')
      } else if (state === 3) {
        this.columnHightlight1.setAttribute('visibility', 'visible')
        this.columnHightlight2.setAttribute('visibility', 'visible')
      }
      this.colHighlightState = state
    }
  }

  setHightlightStateBasedOnX (x) {
    if (x > ORYX_Config.FORM_ROW_WIDTH + 30) {
      this.setHightlightState(2)
    } else {
      this.setHightlightState(1)
    }
  }

  update () {
    this.nodes.each(function (node) {
      this._traverseForUpdate(node)
    }.bind(this))

    // call stencil's layout callback
    let layoutEvents = this.getStencil().layout()
    if (layoutEvents) {
      layoutEvents.each(function (event) {
        // setup additional attributes
        event.shape = this
        event.forceExecution = true
        event.target = this.rootNode

        // do layouting
        this._delegateEvent(event)
      }.bind(this))
    }

    this.nodes.invoke('_update')
    this.edges.invoke('_update', true)
  }

  _traverseForUpdate (shape) {
    let childRet = shape.isChanged
    shape.getChildNodes(false, function (child) {
      if (this._traverseForUpdate(child)) {
        childRet = true
      }
    }.bind(this))

    if (childRet) {
      shape.layout()
      return true
    } else {
      return false
    }
  }

  layout () {}

  /**
   * @param {Object} deep
   * @param {Object} iterator
   */
  getChildNodes (deep, iterator) {
    if (!deep && !iterator) {
      return this.nodes.clone()
    } else {
      let result = []
      this.nodes.each(function (uiObject) {
        if (iterator) {
          iterator(uiObject)
        }
        result.push(uiObject)

        if (deep && uiObject instanceof Shape) {
          result = result.concat(uiObject.getChildNodes(deep, iterator))
        }
      })

      return result
    }
  }

  /**
   * buggy crap! use base class impl instead!
   * @param {Object} iterator
   */

  /*	getChildEdges: function(iterator) {
   if(iterator) {
   this.edges.each(function(edge) {
   iterator(edge);
   });
   }

   return this.edges.clone();
   },
   */
  /**
   * Overrides the UIObject.add method. Adds uiObject to the correct sub node.
   * @param {UIObject} uiObject
   */
  add (uiObject, index, silent) {
    // if uiObject is child of another UIObject, remove it.
    if (uiObject instanceof UIObject) {
      if (!(this.children.member(uiObject))) {
        // if uiObject is child of another parent, remove it from that parent.
        if (uiObject.parent) {
          uiObject.parent.remove(uiObject, true)
        }

        // add uiObject to the Canvas
        // add uiObject to this Shape
        if (index !== undefined) {
          this.children.splice(index, 0, uiObject)
        } else {
          this.children.push(uiObject)
        }

        // set parent reference
        uiObject.parent = this

        // add uiObject.node to this.node depending on the type of uiObject
        if (uiObject instanceof Shape) {
          if (uiObject instanceof Edge) {
            uiObject.addMarkers(this.rootNode.getElementsByTagNameNS(ORYX_Config.NAMESPACE_SVG, 'defs')[0])
            uiObject.node = this.node.childNodes[0].childNodes[2].appendChild(uiObject.node)
            this.edges.push(uiObject)
          } else {
            // uiObject.node = this.node.childNodes[0].childNodes[1].appendChild(uiObject.node)
            if (uiObject.getStencil().id().endsWith('Pool')) {
              console.log(888)
              let childNodes = this.node.childNodes[0].childNodes[1]
              uiObject.node = childNodes.insertBefore(uiObject.node, childNodes.firstChild)
              this.nodes.unshift(uiObject)
            } else {
              uiObject.node = this.node.childNodes[0].childNodes[1].appendChild(uiObject.node)
              this.nodes.push(uiObject)
            }
          }
        } else {
          // UIObject
          uiObject.node = this.node.appendChild(uiObject.node)
        }

        uiObject.bounds.registerCallback(this._changedCallback)

        if (this.eventHandlerCallback && silent !== true) {
          this.eventHandlerCallback({ type: ORYX_Config.EVENT_SHAPEADDED, shape: uiObject })
        }
      } else {
        ORYX_Log.warn('add: ORYX.Core.UIObject is already a child of this object.')
      }
    } else {
      ORYX_Log.fatal('add: Parameter is not of type ORYX.Core.UIObject.')
    }
  }

  /**
   * Overrides the UIObject.remove method. Removes uiObject.
   * @param {UIObject} uiObject
   */
  remove (uiObject, silent) {
    // if uiObject is a child of this object, remove it.
    if (this.children.member(uiObject)) {
      // remove uiObject from children
      let parent = uiObject.parent
      this.children = this.children.without(uiObject)

      // delete parent reference of uiObject
      uiObject.parent = undefined

      // delete uiObject.node from this.node
      if (uiObject instanceof Shape) {
        if (uiObject instanceof Edge) {
          uiObject.removeMarkers()
          uiObject.node = this.node.childNodes[0].childNodes[2].removeChild(uiObject.node)
          this.edges = this.edges.without(uiObject)
        } else {
          uiObject.node = this.node.childNodes[0].childNodes[1].removeChild(uiObject.node)
          this.nodes = this.nodes.without(uiObject)
        }
      } else {	// UIObject
        uiObject.node = this.node.removeChild(uiObject.node)
      }

      if (this.eventHandlerCallback && silent !== true) {
        this.eventHandlerCallback({ type: ORYX_Config.EVENT_SHAPEREMOVED, shape: uiObject, parent: parent })
      }

      uiObject.bounds.unregisterCallback(this._changedCallback)
    } else {
      ORYX_Log.warn('remove: ORYX.Core.UIObject is not a child of this object.')
    }
  }

  removeAll () {
    let childShapes = this.getChildShapes()
    for (let i = 0; i < childShapes.length; i++) {
      let childObject = childShapes[i]
      this.remove(childObject)
    }
  }

  /**
   * Creates shapes out of the given collection of shape objects and adds them to the canvas.
   * @example
   * canvas.addShapeObjects([{
         bounds:{ lowerRight:{ y:510, x:633 }, upperLeft:{ y:146, x:210 } },
         resourceId:"oryx_F0715955-50F2-403D-9851-C08CFE70F8BD",
         childShapes:[],
         properties:{},
         stencil:{
           id:"Subprocess"
         },
         outgoing:[{resourceId: 'aShape'}],
         target: {resourceId: 'aShape'}
       }]);
   * @param {Object} shapeObjects
   * @param {Function} [eventHandler] An event handler passed to each newly created shape (as eventHandlerCallback)
   * @return {Array} A collection of ORYX.Core.Shape
   * @methodOf ORYX.Core.Canvas.prototype
   */
  addShapeObjects (shapeObjects, eventHandler) {
    if (!shapeObjects) return
    this.initializingShapes = true

    /* FIXME This implementation is very evil! At first, all shapes are created on
     canvas. In a second step, the attributes are applied. There must be a distinction
     between the configuration phase (where the outgoings, for example, are just named),
     and the creation phase (where the outgoings are evaluated). This must be reflected
     in code to provide a nicer API/ implementation!!! */

    const addShape = (shape, parent) => {
      // Create a new Stencil
      let stencil = StencilSet.stencil(this.getStencil().namespace() + shape.stencil.id)
      // Create a new Shape
      let ShapeClass = (stencil.type() === 'node') ? Node : Edge
      let newShape = new ShapeClass({ 'eventHandlerCallback': eventHandler }, stencil, this.facade)

      // Set the resource id
      newShape.resourceId = shape.resourceId
      newShape.node.id = 'svg-' + shape.resourceId

      // Set parent to json object to be used later
      // Due to the nested json structure, normally shape.parent is not set/ must not be set.
      // In special cases, it can be easier to set this directly instead of a nested structure.
      shape.parent = '#' + ((shape.parent && shape.parent.resourceId) || parent.resourceId)

      // Add the shape to the canvas
      this.add(newShape)
      return {
        json: shape,
        object: newShape
      }
    }

    /** Builds up recursively a flatted array of shapes, including a javascript object and json representation
     * @param {Object} shape Any object that has Object#childShapes
     */
    const addChildShapesRecursively = (shape) => {
      let addedShapes = []
      if (shape.childShapes && shape.childShapes.constructor === String) {
        shape.childShapes = JSON.parse(shape.childShapes)
      }
      shape.childShapes.forEach((childShape) => {
        addedShapes.push(addShape(childShape, shape))
        addedShapes = addedShapes.concat(addChildShapesRecursively(childShape))
      })

      return addedShapes
    }

    // 排序Node在前，先渲染全部Node后再渲染Edge，防止初次加载docker的referencePoint就产生偏移
    shapeObjects.sort((value1, value2) => {
      let stencil = StencilSet.stencil(this.getStencil().namespace() + value1.stencil.id)
      if (stencil.type() === 'node') {
        return -1;
      } else {
        return 1;
      }
    })
    let shapes = addChildShapesRecursively({
      childShapes: shapeObjects,
      resourceId: this.resourceId
    })
    // prepare deserialisation parameter
    shapes.forEach((shape) => {
        let properties = []
        for (let field in shape.json.properties) {
          properties.push({
            prefix: 'oryx',
            name: field,
            value: shape.json.properties[field]
          })
        }

        // Outgoings
        shape.json.outgoing.forEach((out) => {
          properties.push({
            prefix: 'raziel',
            name: 'outgoing',
            value: '#' + out.resourceId
          })
        })

        // Target
        // (because of a bug, the first outgoing is taken when there is no target,can be removed after some time)
        if (shape.object instanceof Edge) {
          let target = shape.json.target || shape.json.outgoing[0]
          if (target) {
            properties.push({
              prefix: 'raziel',
              name: 'target',
              value: '#' + target.resourceId
            })
          }
        }

        // Bounds
        if (shape.json.bounds) {
          properties.push({
            prefix: 'oryx',
            name: 'bounds',
            value: shape.json.bounds.upperLeft.x + ',' + shape.json.bounds.upperLeft.y + ',' + shape.json.bounds.lowerRight.x + ',' + shape.json.bounds.lowerRight.y
          })
        }

        // Dockers [{x:40, y:50}, {x:30, y:60}] => "40 50 30 60  #"
        if (shape.json.dockers) {
          let str = ''
          shape.json.dockers.map(docker => {
            str += docker.x + ' ' + docker.y + ' '
          })
          str += ' #'
          properties.push({
            prefix: 'oryx',
            name: 'dockers',
            value: str
            // value: shape.json.dockers.inject('', function (dockersStr, docker) {
            //   return dockersStr + docker.x + ' ' + docker.y + ' '
            // }) + ' #'
          })
        }

        // Parent
        properties.push({
          prefix: 'raziel',
          name: 'parent',
          value: shape.json.parent
        })

        shape.__properties = properties
      })

    // Deserialize the properties from the shapes
    // This can't be done earlier because Shape#deserialize expects that all referenced nodes are already there

    // first, deserialize all nodes
    shapes.each((shape) => {
      if (shape.object instanceof Node) {
        shape.object.deserialize(shape.__properties, shape.json)
      } else if (shape.object instanceof Edge) {
        shape.object.deserialize(shape.__properties, shape.json)
        shape.object._oldBounds = shape.object.bounds.clone()
        shape.object._update()
      }
    })

    // second, deserialize all edges
    // shapes.each((shape) => {
    //   if (shape.object instanceof Edge) {
    //     shape.object.deserialize(shape.__properties, shape.json)
    //     shape.object._oldBounds = shape.object.bounds.clone()
    //     shape.object._update()
    //   }
    // })

    delete this.initializingShapes
    // return shapes.pluck('object')
    return  pluck(shapes, 'object')
  }

  /**
   * 更新画布的大小, regarding to the containg shapes.
   */
  updateSize () {
    // Check the size for the canvas
    let maxWidth = 0
    let maxHeight = 0
    let offset = 100
    this.getChildShapes(true, function (shape) {
      let b = shape.bounds
      maxWidth = Math.max(maxWidth, b.lowerRight().x + offset)
      maxHeight = Math.max(maxHeight, b.lowerRight().y + offset)
    })

    if (this.bounds.width() < maxWidth || this.bounds.height() < maxHeight) {
      this.setSize({
        width: Math.max(this.bounds.width(), maxWidth),
        height: Math.max(this.bounds.height(), maxHeight)
      })
    }
  }

  setSize (size, dontSetBounds) {
    if (!size || !size.width || !size.height) {
      return
    }

    if (this.rootNode.parentNode) {
      this.rootNode.parentNode.style.width = size.width + 'px'
      this.rootNode.parentNode.style.height = size.height + 'px'
    }

    this.rootNode.setAttributeNS(null, 'width', size.width)
    this.rootNode.setAttributeNS(null, 'height', size.height)

    // this._htmlContainer.style.top = "-" + (size.height + 4) + 'px';
    if (!dontSetBounds) {
      this.bounds.set({
        a: { x: 0, y: 0 },
        b: { x: size.width / this.zoomLevel, y: size.height / this.zoomLevel }
      })
    }
  }

  getRootNode () {
    return this.rootNode
  }

  getUnderlayNode () {
    return this.underlayNode
  }

  getSvgContainer () {
    return this.node.childNodes[1]
  }

  getHTMLContainer () {
    return this._htmlContainer
  }

  /**
   * Return all elements of the same highest level
   * @param {Object} elements
   */
  getShapesWithSharedParent (elements) {
    // If there is no elements, return []
    if (!elements || elements.length < 1) {
      return []
    }
    // If there is one element, return this element
    if (elements.length === 1) {
      return elements
    }

    return elements.findAll(function (value) {
      let parentShape = value.parent
      while (parentShape) {
        if (elements.member(parentShape)) return false
        parentShape = parentShape.parent
      }
      return true
    })
  }

  /**
   * Returns an SVG document of the current process.
   * @param {Boolean} escapeText Use true, if you want to parse it with an XmlParser,
   *          false, if you want to use the SVG document in browser on client side.
   */
  getSVGRepresentation (escapeText) {
    // Get the serialized svg image source
    let svgClone = this.getRootNode().cloneNode(true)

    this._removeInvisibleElements(svgClone)

    let x1, y1, x2, y2
    this.getChildShapes(true).each(function (shape) {
      let absBounds = shape.absoluteBounds()
      let ul = absBounds.upperLeft()
      let lr = absBounds.lowerRight()
      if (x1 == undefined) {
        x1 = ul.x
        y1 = ul.y
        x2 = lr.x
        y2 = lr.y
      } else {
        x1 = Math.min(x1, ul.x)
        y1 = Math.min(y1, ul.y)
        x2 = Math.max(x2, lr.x)
        y2 = Math.max(y2, lr.y)
      }
    })

    let margin = 50
    let width, height, tx, ty
    if (x1 == undefined) {
      width = 0
      height = 0
      tx = 0
      ty = 0
    } else {
      width = x2
      height = y2
      tx = -x1 + margin / 2
      ty = -y1 + margin / 2
    }

    // Set the width and height
    svgClone.setAttributeNS(null, 'width', width + margin)
    svgClone.setAttributeNS(null, 'height', height + margin)

    //remove scale factor
    svgClone.childNodes[1].removeAttributeNS(null, 'transform')

    try {
      let svgCont = svgClone.childNodes[1].childNodes[1]
      svgCont.parentNode.removeChild(svgCont)
    } catch (e) {
    }

    if (escapeText) {
      $A(svgClone.getElementsByTagNameNS(ORYX_Config.NAMESPACE_SVG, 'tspan')).each(function (elem) {
        elem.textContent = elem.textContent.escapeHTML()
      })

      $A(svgClone.getElementsByTagNameNS(ORYX_Config.NAMESPACE_SVG, 'text')).each(function (elem) {
        if (elem.childNodes.length == 0)
          elem.textContent = elem.textContent.escapeHTML()
      })
    }

    // generating absolute urls for the pdf-exporter
    $A(svgClone.getElementsByTagNameNS(ORYX_Config.NAMESPACE_SVG, 'image')).each(function (elem) {
      let href = elem.getAttributeNS('http://www.w3.org/1999/xlink', 'href')

      if (!href.match('^(http|https)://')) {
        href = window.location.protocol + '//' + window.location.host + href
        elem.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href)
      }
    })


    // escape all links
    $A(svgClone.getElementsByTagNameNS(ORYX_Config.NAMESPACE_SVG, 'a')).each(function (elem) {
      elem.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', (elem.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '').escapeHTML())
    })

    return svgClone
  }

  /**
   * Removes all nodes (and its children) that has the
   * attribute visibility set to "hidden"
   */
  _removeInvisibleElements (element) {
    let index = 0
    while (index < element.childNodes.length) {
      let child = element.childNodes[index]
      if (child.getAttributeNS &&
        child.getAttributeNS(null, 'visibility') === 'hidden') {
        element.removeChild(child)
      } else {
        this._removeInvisibleElements(child)
        index++
      }
    }
  }

  /**
   * This method checks all shapes on the canvas and removes all shapes that
   * contain invalid bounds values or dockers values(NaN)
   */

  /*cleanUp: function(parent) {
   if (!parent) {
   parent = this;
   }
   parent.getChildShapes().each(function(shape){
   var a = shape.bounds.a;
   var b = shape.bounds.b;
   if (isNaN(a.x) || isNaN(a.y) || isNaN(b.x) || isNaN(b.y)) {
   parent.remove(shape);
   }
   else {
   shape.getDockers().any(function(docker) {
   a = docker.bounds.a;
   b = docker.bounds.b;
   if (isNaN(a.x) || isNaN(a.y) || isNaN(b.x) || isNaN(b.y)) {
   parent.remove(shape);
   return true;
   }
   return false;
   });
   shape.getMagnets().any(function(magnet) {
   a = magnet.bounds.a;
   b = magnet.bounds.b;
   if (isNaN(a.x) || isNaN(a.y) || isNaN(b.x) || isNaN(b.y)) {
   parent.remove(shape);
   return true;
   }
   return false;
   });
   this.cleanUp(shape);
   }
   }.bind(this));
   },*/

  _delegateEvent (event) {
    if (this.eventHandlerCallback && (event.target == this.rootNode || event.target == this.rootNode.parentNode)) {
      this.eventHandlerCallback(event, this)
    }
  }

  toString () {
    return 'Canvas ' + this.id
  }

  /**
   * Calls {@link ORYX.Core.AbstractShape#toJSON} and adds some stencil set information.
   */
  toJSON () {
    // var json = arguments.callee.$.toJSON.apply(this, arguments)
    let json = super.toJSON()

    //		if(ORYX.CONFIG.STENCILSET_HANDLER.length > 0) {
    //			json.stencilset = {
    //				url: this.getStencil().stencilSet().namespace()
    //	        };
    //		} else {
    json.stencilset = {
      url: this.getStencil().stencilSet().source(),
      namespace: this.getStencil().stencilSet().namespace()
    }
    //		}

    return json
  }

  getInstanceofType () {
    return 'Canvas'
  }
}
