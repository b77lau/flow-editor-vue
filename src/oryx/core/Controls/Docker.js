import Control from './Control'
import ORYX_Config from '../../CONFIG'
import ORYX_Utils from '../../Utils'

/**
 * @classDescription Represents a movable docker that can be bound to a shape. Dockers are used
 * for positioning shape objects.
 * @extends {Control}
 *
 * TODO absoluteXY und absoluteCenterXY von einem Docker liefern falsche Werte!!!
 */
export default class Docker extends Control {
  constructor () {
    super(...arguments)
    this.isMovable = true				// Enables movability
    this.bounds.set(0, 0, 16, 16)		// Set the bounds
    this.referencePoint = undefined		// Refrenzpoint
    this._dockedShapeBounds = undefined
    this._dockedShape = undefined
    this._oldRefPoint1 = undefined
    this._oldRefPoint2 = undefined

    // this.anchors = []
    this.anchorLeft = null
    this.anchorRight = null
    this.anchorTop = null
    this.anchorBottom = null

    this.node = ORYX_Utils.graft('http://www.w3.org/2000/svg', null, ['g'])

    // The DockerNode reprasentation
    this._dockerNode = ORYX_Utils.graft('http://www.w3.org/2000/svg',
      this.node,
      ['g', { 'pointer-events': 'all' },
        ['circle', { cx: '8', cy: '8', r: '8', stroke: 'none', fill: 'none' }],
        ['circle', { cx: '8', cy: '8', r: '3', stroke: 'black', fill: 'red', 'stroke-width': '1' }]
      ])

    // The ReferenzNode reprasentation
    this._referencePointNode = ORYX_Utils.graft('http://www.w3.org/2000/svg',
      this.node,
      ['g', { 'pointer-events': 'none' },
        ['circle', {
          cx: this.bounds.upperLeft().x,
          cy: this.bounds.upperLeft().y,
          r: 3,
          fill: 'red',
          'fill-opacity': 0.4
        }]])

    // Hide the Docker
    this.hide()

    // Add to the EventHandler
    this.addEventHandlers(this._dockerNode)

    // Buffer the Update Callback for un-/register on Event-Handler
    this._updateCallback = this._changed.bind(this)
  }
  update () {
    // If there have an DockedShape
    if (this._dockedShape) {
      let type = this._dockedShape.getInstanceofType()
      if (this._dockedShapeBounds && type.includes('Node')) {
        // Calc the delta of width and height of the lastBounds and the current Bounds
        let dswidth = this._dockedShapeBounds.width() || 1
        let dsheight = this._dockedShapeBounds.height() || 1
        let widthDelta = this._dockedShape.bounds.width() / dswidth
        let heightDelta = this._dockedShape.bounds.height() / dsheight

        // If there is an different
        if (widthDelta !== 1.0 || heightDelta !== 1.0) {
          // Set the delta
          console.log(444444444, widthDelta, heightDelta)
          this.referencePoint.x *= widthDelta
          this.referencePoint.y *= heightDelta
        }

        // Clone these bounds
        this._dockedShapeBounds = this._dockedShape.bounds.clone()
      }

      // Get the first and the last Docker of the parent Shape
      let dockerIndex = this.parent.dockers.indexOf(this)
      let dock1 = this
      let dock2 = this.parent.dockers.length > 1 ?
        (dockerIndex === 0 ?							// If there is the first element
          this.parent.dockers[dockerIndex + 1] :	// then take the next docker
          this.parent.dockers[dockerIndex - 1]) :  // if not, then take the docker before
        undefined

      // Calculate the first absolute Refenzpoint
      let absoluteReferenzPoint1 = dock1.getDockedShape() ?
        dock1.getAbsoluteReferencePoint() :
        dock1.bounds.center()

      // Calculate the last absolute Refenzpoint
      let absoluteReferenzPoint2 = dock2 && dock2.getDockedShape() ?
        dock2.getAbsoluteReferencePoint() :
        dock2 ?
          dock2.bounds.center() :
          undefined

      // If there is no last absolute Referenzpoint
      if (!absoluteReferenzPoint2) {
        // Calculate from the middle of the DockedShape
        let center = this._dockedShape.absoluteCenterXY()
        let minDimension = this._dockedShape.bounds.width() * this._dockedShape.bounds.height()
        absoluteReferenzPoint2 = {
          x: absoluteReferenzPoint1.x + (center.x - absoluteReferenzPoint1.x) * -minDimension,
          y: absoluteReferenzPoint1.y + (center.y - absoluteReferenzPoint1.y) * -minDimension
        }
      }

      /*if (!this._oldRefPoint1 || !this._oldRefPoint2 ||
       absoluteReferenzPoint1.x !== this._oldRefPoint1.x ||
       absoluteReferenzPoint1.y !== this._oldRefPoint1.y ||
       absoluteReferenzPoint2.x !== this._oldRefPoint2.x ||
       absoluteReferenzPoint2.y !== this._oldRefPoint2.y) {*/

      // Get the new point for the Docker, calucalted by the intersection point of the Shape and the two points
      let newPoint = this._dockedShape.getIntersectionPoint(absoluteReferenzPoint1, absoluteReferenzPoint2)

      // If there is new point, take the referencepoint as the new point
      if (!newPoint) {
        newPoint = this.getAbsoluteReferencePoint()
      }

      if (this.parent && this.parent.parent) {
        let grandParentPos = this.parent.parent.absoluteXY()
        newPoint.x -= grandParentPos.x
        newPoint.y -= grandParentPos.y
      }

      // Set the bounds to the new point
      // if (this._dockedShape) {
      //   let dockedShapeAbsoluteB = this._dockedShape.absoluteBounds()
      //   if (newPoint.x < dockedShapeAbsoluteB.a.x || newPoint.x > dockedShapeAbsoluteB.b.x ||
      //     newPoint.y < dockedShapeAbsoluteB.a.y || newPoint.y > dockedShapeAbsoluteB.b.y){
      //     // docked 溢出
      //     this.setReferencePoint({
      //       x: (dockedShapeAbsoluteB.b.x - dockedShapeAbsoluteB.a.x) / 2,
      //       y: (dockedShapeAbsoluteB.b.y - dockedShapeAbsoluteB.a.y) / 2
      //     })
      //     // this.bounds.centerMoveTo({
      //     //   x: (dockedShapeAbsoluteB.a.x + dockedShapeAbsoluteB.b.x) / 2,
      //     //   y: (dockedShapeAbsoluteB.a.y + dockedShapeAbsoluteB.b.y) / 2
      //     // })
      //
      //     this._oldRefPoint1 = absoluteReferenzPoint1
      //     this._oldRefPoint2 = absoluteReferenzPoint2
      //     return
      //   }
      // }
      this.bounds.centerMoveTo(newPoint)

      this._oldRefPoint1 = absoluteReferenzPoint1
      this._oldRefPoint2 = absoluteReferenzPoint2
    }
    /*else {
     newPoint = this.bounds.center();
     }*/

    //	}

    super.update()
  }
  /**
   * Calls the super class refresh method and updates the view of the docker.
   */
  refresh () {
    super.refresh()
    // Refresh the dockers node
    let p = this.bounds.upperLeft()
    this._dockerNode.setAttributeNS(null, 'transform', 'translate(' + p.x + ', ' + p.y + ')')

    // Refresh the referencepoints node
    p = Object.clone(this.referencePoint)

    if (p && this._dockedShape) {
      let upL
      let type = this.parent.getInstanceofType()
      if (type.includes('Edge')) {
        upL = this._dockedShape.absoluteXY()
      } else {
        upL = this._dockedShape.bounds.upperLeft()
      }
      p.x += upL.x
      p.y += upL.y
    } else {
      p = this.bounds.center()
    }

    this._referencePointNode.setAttributeNS(null, 'transform', 'translate(' + p.x + ', ' + p.y + ')')
  }
  /**
   * Set the reference point
   * @param {Object} point
   */
  setReferencePoint(point) {
    // Set the referencepoint
    if (this.referencePoint !== point &&
      (!this.referencePoint || !point ||
        this.referencePoint.x !== point.x ||
        this.referencePoint.y !== point.y)) {

      console.log(1111, point)
      this.referencePoint = point
      this._changed()
    }
    // Update directly, because the referencepoint has no influence of the bounds
    // this.refresh()
  }

  /**
   * Get the absolute referencepoint
   */
  getAbsoluteReferencePoint() {
    if (!this.referencePoint || !this._dockedShape) {
      return undefined
    } else {
      let absUL = this._dockedShape.absoluteXY()
      return {
        x: this.referencePoint.x + absUL.x,
        y: this.referencePoint.y + absUL.y
      }
    }
  }
  /**
   * Set the docked Shape from the docker
   * @param {Object} shape
   */
  setDockedShape(shape) {
    // If there is an old docked Shape
    if (this._dockedShape) {
      this._dockedShape.bounds.unregisterCallback(this._updateCallback)

      // Delete the Shapes from the incoming and outgoing array
      // If this Docker the incoming of the Shape
      if (this === this.parent.dockers.first()) {
        this.parent.incoming = this.parent.incoming.without(this._dockedShape)
        this._dockedShape.outgoing = this._dockedShape.outgoing.without(this.parent)
        // If this Docker the outgoing of the Shape
      } else if (this === this.parent.dockers.last()) {
        this.parent.outgoing = this.parent.outgoing.without(this._dockedShape)
        this._dockedShape.incoming = this._dockedShape.incoming.without(this.parent)
      }
    }

    // Set the new Shape
    this._dockedShape = shape
    this._dockedShapeBounds = undefined
    let referencePoint = undefined

    // If there is an Shape, register the updateCallback if there are changes in the shape bounds
    if (this._dockedShape) {
      // Add the Shapes to the incoming and outgoing array
      // If this Docker the incoming of the Shape
      if (this === this.parent.dockers.first()) {
        this.parent.incoming.push(shape)
        shape.outgoing.push(this.parent)
        // If this Docker the outgoing of the Shape
      } else if (this === this.parent.dockers.last()) {
        this.parent.outgoing.push(shape)
        shape.incoming.push(this.parent)
      }

      // Get the bounds and set the new referencepoint
      let bounds = this.bounds
      let absUL = shape.absoluteXY()
      referencePoint = {
        x: bounds.center().x - absUL.x,
        y: bounds.center().y - absUL.y
      }

      this._dockedShapeBounds = this._dockedShape.bounds.clone()
      this._dockedShape.bounds.registerCallback(this._updateCallback)

      // Set the color of the docker as docked
      this.setDockerColor(ORYX_Config.DOCKER_DOCKED_COLOR)
    } else {
      // Set the color of the docker as undocked
      this.setDockerColor(ORYX_Config.DOCKER_UNDOCKED_COLOR)
    }

    // Set the referencepoint
    console.log('setReferencePoint', referencePoint)
    this.setReferencePoint(referencePoint)
    // this._changed()
    // this.update()
  }
  /**
   * Get the docked Shape
   */
  getDockedShape() {
    return this._dockedShape
  }
  /**
   * Returns TRUE if the docker has a docked shape
   */
  isDocked() {
    return !!this._dockedShape
  }
  /**
   * Set the Color of the Docker
   * @param {Object} color
   */
  setDockerColor(color) {
    this._dockerNode.lastChild.setAttributeNS(null, 'fill', color)
  }
  preventHiding(prevent) {
    this._preventHiding = Math.max(0, (this._preventHiding || 0) + (prevent ? 1 : -1))
  }
  /**
   * Hides this UIObject and all its children.
   */
  hide () {
    if (this._preventHiding) {
      return false
    }

    // Hide docker and reference point
    this.node.setAttributeNS(null, 'visibility', 'hidden')
    this._referencePointNode.setAttributeNS(null, 'visibility', 'hidden')

    this.children.each(function (uiObj) {
      uiObj.hide()
    })
  }
  /**
   * Enables visibility of this UIObject and all its children.
   */
  show () {
    // Show docker
    this.node.setAttributeNS(null, 'visibility', 'visible')

    // Hide reference point if the connected shape is an edge
    // let type = this.getDockedShape() && this.getDockedShape().getInstanceofType()
    if (this.getDockedShape() && this.getDockedShape().getInstanceofType().includes('Edge')) {
      this._referencePointNode.setAttributeNS(null, 'visibility', 'hidden')
    } else {
      this._referencePointNode.setAttributeNS(null, 'visibility', 'visible')
    }

    this.children.each(function (uiObj) {
      uiObj.show()
    })
  }
  toString() {
    return 'Docker ' + this.id
  }
  getInstanceofType () {
    return 'Docker'
  }
}
