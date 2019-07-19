import ORYX_Config from '../CONFIG'
import ORYX_Utils from '../Utils'
import ORYX_Shape from '../core/Shape'
import Plugin_Edit from './Edit'
import SetPropertyCommand from '../../flowable/Command/setProperty'
import autogrow from '../../libs/jquery.autogrow-textarea'

// 双击修改名称
export default class RenameShapes {
  constructor (facade) {
    this.facade = facade
    this.facade.registerOnEvent(ORYX_Config.EVENT_CANVAS_SCROLL, this.hideField.bind(this))
    this.facade.registerOnEvent(ORYX_Config.EVENT_DBLCLICK, this.actOnDBLClick.bind(this))
    // this.facade.offer({
    //   keyCodes: [{
    //     keyCode: 113, // F2-Key
    //     keyAction: ORYX_Config.KEY_ACTION_DOWN
    //   }],
    //   functionality: this.renamePerF2.bind(this)
    // })
    this.hideFun = this.hide.bind(this)
    document.documentElement.addEventListener(ORYX_Config.EVENT_MOUSEDOWN, this.hideFun, true)
  }

  /**
   * This method handles the "F2" key down event. The selected shape are looked
   * up and the editing of title/name of it gets started.
   */
  renamePerF2 () {
    let selectedShapes = this.facade.getSelection()
    this.actOnDBLClick(undefined, selectedShapes.first())
  }

  actOnDBLClick (evt, shape) {
    if (!(shape instanceof ORYX_Shape)) {
      return
    }
    if (shape.properties.get('canDblClickEdit') === false ||
      shape.properties.get('canDblClickEdit') === 'false') {
      return
    }

    // Destroys the old input, if there is one
    this.destroy()

    // Get all properties which where at least one ref to view is set
    let props = shape.getStencil().properties().findAll(function (item) {
      return (item.refToView() && item.refToView().length > 0 && item.directlyEditable())
    })
    // from these, get all properties where write access are and the type is String or Expression
    props = props.findAll(function (item) {
      return !item.readonly() &&
        (item.type() === ORYX_Config.TYPE_STRING
          || item.type() === ORYX_Config.TYPE_EXPRESSION
          || item.type() === ORYX_Config.TYPE_DATASOURCE)
    })

    // Get all ref ids
    let allRefToViews = props.collect(function (prop) {
      return prop.refToView()
    }).flatten().compact()
    // Get all labels from the shape with the ref ids

    let labels = shape.getLabels().findAll(function (label) {
      return allRefToViews.any(function (toView) {
        return label.id.endsWith(toView)
      })
    })
    // If there are no referenced labels --> return
    if (labels.length === 0) {
      return
    }

    // Define the nearest label
    let nearestLabel = labels.length === 1 ? labels[0] : null

    if (!nearestLabel) {
      nearestLabel = labels.find(function (label) {
        return label.node == evt.target || label.node == evt.target.parentNode
      })
      if (!nearestLabel) {
        let evtCoord = this.facade.eventCoordinates(evt)
        let diff = labels.map((label) => {
          // let center = this.getCenterPosition(label.node, shape)
          let center = this.getCenterPositionself(label.node, shape)
          let len = Math.sqrt(Math.pow(center.x - evtCoord.x, 2) + Math.pow(center.y - evtCoord.y, 2))
          return { diff: len, label: label }
        })

        diff.sort(function (a, b) {
          return a.diff - b.diff
        })
        // console.log('diff', diff)
        nearestLabel = diff[0].label
      }
    }

    // Get the particular property for the label
    let prop = props.find(function (item) {
      return item.refToView().any(function (toView) {
        return nearestLabel.id === shape.id + toView
      })
    })

    // Get the center position from the nearest label
    // let width = Math.min(Math.max(100, shape.bounds.width()), 200)
    let width = Math.min(Math.max(100, shape.bounds.width()), 200)
    // console.log('223', nearestLabel.node, shape)
    let center = this.getCenterPosition(nearestLabel.node, shape)
    // console.log('center', center)
    center.x -= (width / 2)
    // let propId = prop.prefix() + '-' + prop.id()
    let propId = prop.id()
    let textInput = document.createElement('textarea')
    textInput.id = 'shapeTextInput'
    textInput.style.position = 'absolute'
    textInput.style.width = width + 'px'
    textInput.style.left = (center.x < 10) ? 10 : center.x + 'px'
    textInput.style.top = (center.y - 15) + 'px'
    textInput.style.fontSize = '12px'
    textInput.value = shape.properties.get(propId)
    this.oldValueText = shape.properties.get(propId)
    document.getElementById('canvasSection').appendChild(textInput)
    this.shownTextField = textInput
    this.currentShape = shape
    this.propId = propId

    jQuery('#shapeTextInput').focus()
    jQuery('#shapeTextInput').autogrow()

    // Disable the keydown in the editor (that when hitting the delete button, the shapes not get deleted)
    this.facade.disableEvent(ORYX_Config.EVENT_KEYDOWN)
  }

  getEditPlugin (facade) {
    if (!this.EditPlugin) {
      this.EditPlugin = new Plugin_Edit(facade)
    }
    return this.EditPlugin
  }
  // Value change listener needs to be defined now since we reference it in the text field
  updateValueFunction (newValue, oldValue) {
    let type = this.currentShape.getStencil().idWithoutNs()
    if (type === 'TextArea' && !newValue) {
      this.getEditPlugin(this.facade).editDelete()
      return
    }

    if (oldValue != newValue) {
      // Instantiated the class
      const command = new SetPropertyCommand(this.propId, oldValue, newValue, this.currentShape, this.facade)
      // Execute the command
      this.facade.executeCommands([command])
      this.facade.raiseEvent({
        type: ORYX_Config.EVENT_PROPERTY_CHANGED_BYOUTSIDE,
        newValue: newValue,
        oldValue: oldValue,
        shape: this.currentShape,
        key: this.propId
      })
    }
  }

  getCenterPositionself (svgNode, shape) {
    if (!svgNode) {
      return { x: 0, y: 0 }
    }
    // console.log('=====', svgNode.getBBox())

    let scale = this.facade.getCanvas().node.getScreenCTM()
    let absoluteXY = shape.absoluteBounds().upperLeft()
    let bbox = svgNode.getBBox()
    let center = {}
    if (bbox.x || bbox.width) {
      center = {
        x: absoluteXY.x + bbox.x + bbox.width / 2,
        y: absoluteXY.y + bbox.y + bbox.height / 2
      }

      center.x *= scale.a
      center.y *= scale.d
    } else {
      let x = svgNode.getAttributeNS(null, 'x')
      let y = svgNode.getAttributeNS(null, 'y')
      // console.log(35, x, y)
      center = {
        x: absoluteXY.x + Number(x),
        y: absoluteXY.y + Number(y)
      }
    }
    // console.log(77, center)
    return center
  }

  getCenterPosition (svgNode, shape) {
    if (!svgNode) {
      return { x: 0, y: 0 }
    }

    let scale = this.facade.getCanvas().node.getScreenCTM()
    let absoluteXY = shape.bounds.upperLeft()

    let center = null
    let fittoelemSign = false
    let fittoelem = svgNode.getAttributeNS(ORYX_Config.NAMESPACE_ORYX, 'fittoelem')
    if (fittoelem) {
      let rects = shape.node.getElementsByTagName('rect')
      let ClientRect = null
      for (let i = 0; i < rects.length; i++) {
        if (rects[i].getAttributeNS(null, 'id') === shape.id + fittoelem) {
          ClientRect = rects[i].getBoundingClientRect()
          center = {
            x: ClientRect.left + ClientRect.width / 2,
            y: ClientRect.top + ClientRect.height / 2
          }
          // console.log(66, center)
          fittoelemSign = true
          // return center
        }
      }
    }
    if (!fittoelemSign) {
      let hasParent = true
      let searchShape = shape
      while (hasParent) {
        if (searchShape.getParentShape().getStencil().idWithoutNs() === 'BPMNDiagram' ||
          searchShape.getParentShape().getStencil().idWithoutNs() === 'CMMNDiagram') {
          hasParent = false
        } else {
          let parentXY = searchShape.getParentShape().bounds.upperLeft()
          absoluteXY.x += parentXY.x
          absoluteXY.y += parentXY.y
          searchShape = searchShape.getParentShape()
        }
      }

      center = shape.bounds.midPoint()
      center.x += absoluteXY.x + scale.e
      center.y += absoluteXY.y + scale.f

      center.x *= scale.a
      center.y *= scale.d
    }
    let additionalIEZoom = ORYX_Utils.IEZoomBelow10(1)
    const canvasSection = jQuery('#canvasSection')
    const canvasSectionOffset = canvasSection.offset()

    if (additionalIEZoom === 1) {
      center.y = center.y - canvasSectionOffset.top + 5
      center.x -= canvasSectionOffset.left
    } else {
      let canvasOffsetLeft = canvasSectionOffset.left
      let canvasScrollLeft = canvasSection.scrollLeft()
      let canvasScrollTop = canvasSection.scrollTop()

      let offset = scale.e - (canvasOffsetLeft * additionalIEZoom)
      let additionaloffset = 0
      if (offset > 10) {
        additionaloffset = (offset / additionalIEZoom) - offset
      }
      center.y = center.y - (canvasSectionOffset.top * additionalIEZoom) + 5 + ((canvasScrollTop * additionalIEZoom) - canvasScrollTop)
      center.x = center.x - (canvasOffsetLeft * additionalIEZoom) + additionaloffset + ((canvasScrollLeft * additionalIEZoom) - canvasScrollLeft)
    }
    return center
  }

  hide (e) {
    if (this.shownTextField && (!e || e.target !== this.shownTextField)) {
      let newValue = this.shownTextField.value
      if (newValue !== this.oldValueText) {
        this.updateValueFunction(newValue, this.oldValueText)
      }
      this.destroy()
    }
  }

  hideField (e) {
    if (this.shownTextField) {
      this.destroy()
    }
  }

  destroy (e) {
    let textInputComp = jQuery('#shapeTextInput')
    if (textInputComp) {
      textInputComp.remove()
      delete this.shownTextField

      this.facade.enableEvent(ORYX_Config.EVENT_KEYDOWN)
    }
  }

  clearAddEventListener () {
    document.documentElement.removeEventListener(ORYX_Config.EVENT_MOUSEDOWN, this.hideFun, true)
  }
}
