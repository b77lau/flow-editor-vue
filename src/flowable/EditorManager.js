import TOOLBAR_ACTIONS from './TOOLBAR_ACTIONS'
import FLOW_eventBus from './FLOW_eventBus'
import { findGroup, addGroup } from '../Util'
import ORYX from '../oryx'

import CreateCommand from './Command/CreateCommand'
import MorphTo from './Command/MorphTo'
import SetProperty from './Command/setProperty'
import setProperties from './Command/setProperties'
import CommandClass from './Command/commandClass'

/**流程图编辑器 类
 * @params modelData: 流程图实例数据
 * @params stencilData: 流程元素/组件
 **/
export default class EditorManager {
  Commands = {
    CreateCommand,
    MorphTo,
    SetProperty,
    setProperties,
    CommandClass
  }
  TOOLBAR_ACTIONS = TOOLBAR_ACTIONS
  constructor (config) {
    this.listeners = {}
    config = jQuery.extend(true, {}, config)
    this.paramsConfig = config
    // config.editorConfigs && ORYX.CONFIG.setCustomConfigs(config.editorConfigs)
    this.treeFilteredElements = ['SubProcess', 'CollapsedSubProcess']
    this.canvasTracker = new Hash()
    this.structualIcons = {
      'SubProcess': 'expanded.subprocess.png',
      'CollapsedSubProcess': 'subprocess.png',
      'EventSubProcess': 'event.subprocess.png'
    }

    // 设置不需要双击修改名称功能的节点
    this.elementsWithoutRenameAction = config.elementsWithoutRenameAction

    this.setModelId(config.modelData.modelId)
    this.current = this.modelId // 当前流程id
    this.loading = true

    // 设置 this.modelData
    this.setModelData(config.modelData)
    // 设置 this.stencilData
    this.setStencilData(config.stencilData)
    this.setShowStencilData()

    this.setToolbarItems(ORYX.CONFIG.CustomConfigs.TOOLBAR_CONFIG)

    const baseUrl = 'http://b3mn.org/stencilset/'

    const stencilSet = new ORYX.Core.StencilSet.StencilSet(baseUrl, config.stencilData)

    ORYX.Core.StencilSet.loadStencilSet(baseUrl, stencilSet, config.modelData.modelId)
    config.pluginConfig && ORYX.Plugins._loadPlugins(config.pluginConfig)
    // 拖拽功能辅助变量
    this.dragCurrentParent = undefined
    this.dragCurrentParentId = undefined
    this.dragCurrentParentStencil = undefined
    this.dropTargetElement = undefined

    // 元素选择辅助变量
    this.selectedItem = {}

    this.bootEditor()
  }
  assignCommand (type, ...configs) {
    if (!type) return
    const Commands = this.Commands
    let command = new Commands[type](...configs)
    this.executeCommands([command])
  }

  instanceofCanvas (shape) {
    return shape instanceof ORYX.Core.Canvas
  }
  instanceofNode (shape) {
    return shape instanceof ORYX.Core.Node
  }
  instanceofEdge (shape) {
    return shape instanceof ORYX.Core.Edge
  }

  getSelectedItem () { return this.selectedItem }
  getSelectedShape () { return this.selectedShape }
  getContainmentRules () { return this.containmentRules }
  getToolbarItems () { return this.toolbarItems }
  setToolbarItems (toolbars) {
    // let items = []
    // const toolbarItems = FLOWABLE.TOOLBAR_CONFIG.items
    // for (let i = 0; i < toolbarItems.length; i++) {
    //   if (this.modelData.model.modelType === 'form') {
    //     if (!toolbarItems[i].disableInForm) {
    //       items.push(toolbarItems[i])
    //     }
    //   } else {
    //     items.push(toolbarItems[i])
    //   }
    // }
    // this.toolbarItems = items
    //
    // console.log(8, items)
    // console.log(9, toolbars.items)
    this.toolbarItems = toolbars.items
    this.secondaryToolbarItems = toolbars.secondaryItems
  }

  getSecondaryItems () { return this.secondaryToolbarItems }

  getModelId () { return this.modelId }
  setModelId (modelId) { this.modelId = modelId }

  getModel () {
    this.syncCanvasTracker()

    let modelMetaData = this.getBaseModelData()

    let stencilId = undefined
    let stencilSetNamespace = undefined
    let stencilSetUrl = undefined
    if (modelMetaData.model.stencilset.namespace == 'http://b3mn.org/stencilset/cmmn1.1#') {
      stencilId = 'CMMNDiagram'
      stencilSetNamespace = 'http://b3mn.org/stencilset/cmmn1.1#'
      stencilSetUrl = '../editor/stencilsets/cmmn1.1/cmmn1.1.json'
    } else {
      stencilId = 'BPMNDiagram'
      stencilSetNamespace = 'http://b3mn.org/stencilset/bpmn2.0#'
      stencilSetUrl = '../editor/stencilsets/bpmn2.0/bpmn2.0.json'
    }

    // this is an object.
    let editorConfig = this.editor.getJSON()
    let model = {
      modelId: this.modelId,
      bounds: editorConfig.bounds,
      properties: editorConfig.properties,
      childShapes: JSON.parse(this.canvasTracker.get(this.modelId)),
      stencil: {
        id: stencilId
      },
      stencilset: {
        namespace: stencilSetNamespace,
        url: stencilSetUrl
      }
    }

    this._mergeCanvasToChild(model)

    return model
  }
  setModelData (response) {
    this.modelData = response
    // _this.UPDATE_modelData(response)
  }

  getBaseModelData () { return this.modelData }

  getCurrentModelId () { return this.current }

  getStencilData () { return this.stencilData }
  setStencilData (stencilData) {
    // we don't want a references!
    this.stencilData = jQuery.extend(true, {}, stencilData)
  }
  getShowStencilData () {
    return this.showStencilData
  }
  setShowStencilData () {
    let quickMenu = undefined
    let ignoreNode = undefined
    const data = this.stencilData
    if (data.namespace === 'http://b3mn.org/stencilset/cmmn1.1#') {
      quickMenu = ['HumanTask', 'Association']
      ignoreNode = ['CasePlanModel']
    } else {
      quickMenu = ['UserTask2', 'EndNoneEvent', 'ExclusiveGateway',
        'CatchTimerEvent', 'ThrowNoneEvent', 'TextAnnotation',
        'SequenceFlow', 'Association']
      ignoreNode = ['SequenceFlow', 'MessageFlow', 'Association',
        'DataAssociation', 'DataStore', 'SendTask', 'UserTask']
    }
    let quickMenuDefinition = this.paramsConfig.editorConfigs.quickMenuDefinition || quickMenu
    let ignoreForPaletteDefinition = this.paramsConfig.editorConfigs.ignoreForPaletteDefinition || ignoreNode

    let quickMenuItems = []
    let morphRoles = []
    for (let i = 0; i < data.rules.morphingRules.length; i++) {
      if (!data.rules.morphingRules[i].hideMorphButton) {

      }
      // let role = data.rules.morphingRules[i].role
      const { role, hideMorphButton } = data.rules.morphingRules[i]
      let roleItem = { 'role': role, 'hideMorphButton': hideMorphButton, 'morphOptions': [] }
      morphRoles.push(roleItem)
    }

    let stencilItemGroups_ary = []

    // Check all received items
    for (let stencilIndex = 0; stencilIndex < data.stencils.length; stencilIndex++) {
      // Check if the root group is the 'diagram' group. If so, this item should not be shown.
      let currentGroupName = data.stencils[stencilIndex].groups[0]
      if (currentGroupName === 'Diagram' || currentGroupName === 'Form') {
        continue  // go to next item
      }

      let removed = false
      if (data.stencils[stencilIndex].removed) {
        removed = true
      }

      let currentGroup = undefined
      if (!removed) {
        // Check if this group already exists. If not, we create a new one
        if (currentGroupName !== null && currentGroupName !== undefined && currentGroupName.length > 0) {
          currentGroup = findGroup(currentGroupName, stencilItemGroups_ary) // Find group in root groups array
          if (currentGroup === null) {
            currentGroup = addGroup(currentGroupName, stencilItemGroups_ary)
          }

          // Add all child groups (if any)
          for (let groupIndex = 1; groupIndex < data.stencils[stencilIndex].groups.length; groupIndex++) {
            let childGroupName = data.stencils[stencilIndex].groups[groupIndex]
            let childGroup = findGroup(childGroupName, currentGroup.groups)
            if (childGroup === null) {
              childGroup = addGroup(childGroupName, currentGroup.groups)
            }

            // The current group variable holds the parent of the next group (if any),
            // and is basically the last element in the array of groups defined in the stencil item
            currentGroup = childGroup
          }
        }
      }

      // Construct the stencil item
      let stencilItem = {
        'id': data.stencils[stencilIndex].id,
        'name': data.stencils[stencilIndex].title,
        'description': data.stencils[stencilIndex].description,
        'icon': data.stencils[stencilIndex].icon,
        'type': data.stencils[stencilIndex].type,
        'roles': data.stencils[stencilIndex].roles,
        'removed': removed,
        'customIcon': false,
        'canConnect': false,
        'canConnectTo': false,
        'canConnectAssociation': false
      }

      if (data.stencils[stencilIndex].customIconId && data.stencils[stencilIndex].customIconId > 0) {
        stencilItem.customIcon = true
        stencilItem.icon = data.stencils[stencilIndex].customIconId
      }

      if (!removed) {
        let index = quickMenuDefinition.indexOf(stencilItem.id)
        if (index >= 0) {
          quickMenuItems[index] = stencilItem
        }
      }

      if (stencilItem.id === 'TextAnnotation'
        || stencilItem.id === 'BoundaryCompensationEvent'
        || stencilItem.id === 'FlowBox') {
        stencilItem.canConnectAssociation = true
      }

      for (let i = 0; i < data.stencils[stencilIndex].roles.length; i++) {
        let stencilRole = data.stencils[stencilIndex].roles[i]
        if (data.namespace === 'http://b3mn.org/stencilset/cmmn1.1#') {
          if (stencilRole === 'association_start') {
            stencilItem.canConnect = true
          } else if (stencilRole === 'association_end') {
            stencilItem.canConnectTo = true
            stencilItem.canConnectTo = true
          }
        } else {
          if (stencilRole === 'sequence_start') {
            stencilItem.canConnect = true
          } else if (stencilRole === 'sequence_end') {
            stencilItem.canConnectTo = true
          }
        }

        for (let j = 0; j < morphRoles.length; j++) {
          if (stencilRole === morphRoles[j].role) {
            if (!removed) {
              morphRoles[j].morphOptions.push(stencilItem)
            }
            stencilItem.morphRole = morphRoles[j].role
            break
          }
        }
      }

      if (currentGroup) {
        // Add the stencil item to the correct group
        currentGroup.items.push(stencilItem)
        if (ignoreForPaletteDefinition.indexOf(stencilItem.id) < 0) {
          currentGroup.paletteItems.push(stencilItem)
        }
      } else {
        // It's a root stencil element
        if (!removed) {
          stencilItemGroups_ary.push(stencilItem)
        }
      }

    }

    for (let i = 0; i < stencilItemGroups_ary.length; i++) {
      if (stencilItemGroups_ary[i].paletteItems && stencilItemGroups_ary[i].paletteItems.length === 0) {
        stencilItemGroups_ary[i].visible = false
      }
    }

    this.showStencilData = stencilItemGroups_ary
    // this.UPDATE_stencilItemGroups(stencilItemGroups_ary)

    let containmentRules = []
    for (let i = 0; i < data.rules.containmentRules.length; i++) {
      let rule = data.rules.containmentRules[i]
      containmentRules.push(rule)
    }
    this.containmentRules = containmentRules

    // remove quick menu items which are not available anymore due to custom pallette
    let availableQuickMenuItems = []
    for (let i = 0; i < quickMenuItems.length; i++) {
      if (quickMenuItems[i]) {
        availableQuickMenuItems[availableQuickMenuItems.length] = quickMenuItems[i]
      }
    }

    this.quickMenuItems = availableQuickMenuItems
    this.morphRoles = morphRoles
    // console.log('availableQuickMenuItems', availableQuickMenuItems)
    // console.log('morphRoles', morphRoles)
  }

  getSelection () { return this.editor.selection }
  setSelection (selection) { this.editor.setSelection(selection) }
  updateSelection () { this.editor.updateSelection() }
  getSubSelection () {
    return this.editor._subSelection
  }

  bootEditor () {
    // TODO: populate the canvas with correct json sections.
    this.canvasTracker = new Hash()

    // 第一个参数boolean代表是否进行深度拷贝
    let config = jQuery.extend(true, {}, this.modelData)

    if (!config.model.childShapes) {
      config.model.childShapes = []
    }

    // this will remove any childshapes of a collapseable subprocess.
    this.findAndRegisterCanvas(config.model.childShapes)

    // this will be overwritten almost instantly.
    this.canvasTracker.set(config.modelId, JSON.stringify(config.model.childShapes))
    console.log('config', config)
    this.editor = new ORYX.Editor(config)

    this.current = this.editor.id
    this.loading = false

    FLOW_eventBus.dispatch('ORYX-EDITOR-LOADED', {})
    FLOW_eventBus.dispatch(ORYX.CONFIG.EVENT_TYPE_EDITOR_BOOTED, {})

    const eventMappings = [
      // 元素选择
      { oryxType: ORYX.CONFIG.EVENT_SELECTION_CHANGED, flowableType: ORYX.CONFIG.EVENT_TYPE_SELECTION_CHANGE },
      // 双击
      { oryxType: ORYX.CONFIG.EVENT_DBLCLICK, flowableType: ORYX.CONFIG.EVENT_TYPE_DOUBLE_CLICK },
      // 鼠标状态
      { oryxType: ORYX.CONFIG.EVENT_MOUSEOUT, flowableType: ORYX.CONFIG.EVENT_TYPE_MOUSE_OUT },
      { oryxType: ORYX.CONFIG.EVENT_MOUSEOVER, flowableType: ORYX.CONFIG.EVENT_TYPE_MOUSE_OVER },
      { oryxType: ORYX.CONFIG.EVENT_EDITOR_INIT_COMPLETED, flowableType: ORYX.CONFIG.EVENT_TYPE_EDITOR_READY },
      // 属性变化
      {
        oryxType: ORYX.CONFIG.EVENT_PROPERTY_CHANGED,
        flowableType: ORYX.CONFIG.EVENT_TYPE_PROPERTY_VALUE_CHANGED
      },
      {
        oryxType: ORYX.CONFIG.EVENT_PROPERTY_CHANGED_BYOUTSIDE,
        flowableType: ORYX.CONFIG.EVENT_TYPE_PROPERTY_CHANGED_BYOUTSIDE
      }
    ]

    eventMappings.forEach((eventMapping) => {
      this.registerOnEvent(eventMapping.oryxType, (event, shape) => {
        FLOW_eventBus.dispatch(eventMapping.flowableType, event, shape)
      })
    })

    // if an element is added te properties will catch this event.
    FLOW_eventBus.addListener(ORYX.CONFIG.EVENT_TYPE_PROPERTY_VALUE_CHANGED, this.filterEvent.bind(this))
    FLOW_eventBus.addListener(ORYX.CONFIG.EVENT_TYPE_ITEM_DROPPED, this.filterEvent.bind(this))
    FLOW_eventBus.addListener('EDITORMANAGER-EDIT-ACTION', function () {
      this.renderProcessHierarchy()
    })

    this.initAddListener()
    this.initRegisterOnEvent()
  }

  renderProcessHierarchy () {
    // only start calculating when the editor has done all his constructor work.
    if (!this.isEditorReady) {
      return false
    }

    if (!this.isLoading()) {
      // the current implementation of has a lot of eventlisteners. when calling getTree() it could manipulate
      // the canvastracker while the canvas is stille loading stuff.
      //TODO: check if its possible to trigger the re-rendering by a single event instead of registering on 10 events...
      this.treeview = this.getTree()
    }
  }
  filterEvent (event) {
    // 当用户通过属性编辑器更改属性时会触发此事件。
    if (event.type === ORYX.CONFIG.EVENT_TYPE_PROPERTY_VALUE_CHANGED) {
      if (event.keys.includes('oryx-overrideid') || event.keys.includes('oryx-name')) {
        this.renderProcessHierarchy()
      }
      // if (event.property.key === 'oryx-overrideid' || event.property.key === 'oryx-name') {
      //   this.renderProcessHierarchy()
      // }
    } else if (event.type === 'propertyChanged') {
      // 当更新或修改 stencil / shape's text 时会触发此事件
      if (event.name === 'oryx-overrideid' || event.name === 'oryx-name') {
        this.renderProcessHierarchy()
      }
    } else if (event.type === ORYX.CONFIG.ACTION_DELETE_COMPLETED) {
      this.renderProcessHierarchy()
      // for some reason the new tree does not trigger an ui update.
    } else if (event.type === 'event-type-item-dropped') {
      this.renderProcessHierarchy()
    }
  }

  /**
   * Helper method to find a stencil item.
   */
  getStencilItemById (stencilItemId) {
    for (let i = 0; i < this.showStencilData.length; i++) {
      let element = this.showStencilData[i]

      // Real group
      if (element.items !== null && element.items !== undefined) {
        var item = this.findStencilItemInGroup(stencilItemId, element)
        if (item) {
          return item
        }
      } else { // Root stencil item
        if (element.id === stencilItemId) {
          return element
        }
      }
    }
    return undefined
  }

  /**
   * Helper method that searches a group for an item with the given id.
   * If not found, will return undefined.
   */
  findStencilItemInGroup (stencilItemId, group) {
    var item

    // Check all items directly in this group
    for (var j = 0; j < group.items.length; j++) {
      item = group.items[j]
      if (item.id === stencilItemId) {
        return item
      }
    }

    // Check the child groups
    if (group.groups && group.groups.length > 0) {
      for (var k = 0; k < group.groups.length; k++) {
        item = this.findStencilItemInGroup(stencilItemId, group.groups[k])
        if (item) {
          return item
        }
      }
    }

    return undefined
  }

  handleEvents (events) {
    this.editor.handleEvents(events)
  }
  registerOnEvent (event, callback) {
    this.editor.registerOnEvent(event, callback)
  }

  getChildShapeByResourceId (resourceId) {
    return this.editor.getCanvas().getChildShapeByResourceId(resourceId)
  }
  getJSON () { return this.editor.getJSON() }

  getStencilSets () { return this.editor.getStencilSets() }
  getCanvas () { return this.editor.getCanvas() }
  getRules () { return this.editor.getRules() }
  getEditor () {
    // TODO: find out if we can avoid exposing the editor object to angular.
    return this.editor
  }
  getTree () {
    //build a tree of all subprocesses and there children.
    var result = new Hash()
    var parent = this.getModel()
    result.set('name', parent.properties['name'] || 'No name provided')
    result.set('id', this.modelId)
    result.set('type', 'root')
    result.set('current', this.current === this.modelId)
    var childShapes = parent.childShapes
    var children = this._buildTreeChildren(childShapes)
    result.set('children', children)
    return result.toObject()
  }

  executeCommands (commands) {
    this.editor.executeCommands(commands)
  }
  eventCoordinates (coordinates) {
    return this.editor.eventCoordinates(coordinates)
  }
  eventCoordinatesXY (x, y) {
    return this.editor.eventCoordinatesXY(x, y)
  }

  edit (resourceId) {
    // Save the current canvas in the canvastracker if it is the root process.
    this.syncCanvasTracker()

    this.loading = true

    var shapes = this.getCanvas().getChildren()
    shapes.each(function (shape) {
      this.editor.deleteShape(shape)
    }.bind(this))

    shapes = this.canvasTracker.get(resourceId)
    if (!shapes) {
      shapes = JSON.stringify([])
    }

    this.editor.loadSerialized({
      childShapes: shapes
    })

    this.getCanvas().update()

    this.current = resourceId

    this.loading = false
    FLOW_eventBus.dispatch('EDITORMANAGER-EDIT-ACTION', {})
    FLOW_eventBus.dispatch(ORYX.CONFIG.EVENT_TYPE_UNDO_REDO_RESET, {})
  }

  _buildTreeChildren (childShapes) {
    var children = []
    for (var i = 0; i < childShapes.length; i++) {
      var childShape = childShapes[i]
      var stencilId = childShape.stencil.id
      //we are currently only interested in the expanded subprocess and collapsed processes
      if (stencilId && this.treeFilteredElements.indexOf(stencilId) > -1) {
        var child = new Hash()
        child.set('name', childShape.properties.name || 'No name provided')
        child.set('id', childShape.resourceId)
        child.set('type', stencilId)
        child.set('current', childShape.resourceId === this.current)

        //check if childshapes

        if (stencilId === 'CollapsedSubProcess') {
          //the save function stores the real object as a childshape
          //it is possible that there is no child element because the user did not open the collapsed subprocess.
          if (childShape.childShapes.length === 0) {
            child.set('children', [])
          } else {
            child.set('children', this._buildTreeChildren(childShape.childShapes))
          }
          child.set('editable', true)
        } else {
          child.set('children', this._buildTreeChildren(childShape.childShapes))
          child.set('editable', false)
        }
        child.set('icon', this.structualIcons[stencilId])
        children.push(child.toObject())
      }
    }
    return children
  }
  syncCanvasTracker () {
    let shapes = this.getCanvas().getChildren()
    let jsonShapes = []
    shapes.each(function (shape) {
      //toJson is an summary object but its not a json string.!!!!!
      jsonShapes.push(shape.toJSON())
    })
    this.canvasTracker.set(this.current, JSON.stringify(jsonShapes))
  }
  findAndRegisterCanvas (childShapes) {
    for (let i = 0; i < childShapes.length; i++) {
      let childShape = childShapes[i]
      if (childShape.stencil.id === 'CollapsedSubProcess') {
        if (childShape.childShapes.length > 0) {
          //the canvastracker will auto correct itself with a new canvasmodel see this.edit()...
          this.findAndRegisterCanvas(childShape.childShapes)
          //a canvas can't be nested as a child because the editor would crash on redundant information.
          this.canvasTracker.set(childShape.resourceId, JSON.stringify(childShape.childShapes))
          //reference to config will clear the value.
          childShape.childShapes = []
        } else {
          this.canvasTracker.set(childShape.resourceId, '[]')
        }
      }
    }
  }
  _mergeCanvasToChild (parent) {
    for (let i = 0; i < parent.childShapes.length; i++) {
      let childShape = parent.childShapes[i]
      if (childShape.stencil.id === 'CollapsedSubProcess') {

        let elements = this.canvasTracker.get(childShape.resourceId)
        if (elements) {
          elements = JSON.parse(elements)
        } else {
          elements = []
        }
        childShape.childShapes = elements
        this._mergeCanvasToChild(childShape)
      } else if (childShape.stencil.id === 'SubProcess') {
        this._mergeCanvasToChild(childShape)
      } else {
        //do nothing?
      }
    }
  }
  isLoading () {
    return this.loading
  }

  navigateTo (resourceId) {
    //TODO: this could be improved by check if the resourceId is not equal to the current tracker...
    this.syncCanvasTracker()
    let found = false
    this.canvasTracker.each(function (pair) {
      let key = pair.key
      let children = JSON.parse(pair.value)
      let targetable = this._findTarget(children, resourceId)
      if (!found && targetable) {
        this.edit(key)
        let flowableShape = this.getCanvas().getChildShapeByResourceId(targetable)
        this.setSelection([flowableShape], [], true)
        found = true
      }
    }, this)
  }

  _findTarget (children, resourceId) {
    for (let i = 0; i < children.length; i++) {
      let child = children[i]
      if (child.resourceId === resourceId) {
        return child.resourceId
      } else if (child.properties && child.properties['overrideid'] === resourceId) {
        return child.resourceId
      } else {
        let result = this._findTarget(child.childShapes, resourceId)
        if (result) {
          return result
        }
      }
    }
    return false
  }

  dispatchFlowEvent (type, event) {
    FLOW_eventBus.dispatch(type, event)
  }

  initRegisterOnEvent () {
    this.registerOnEvent(ORYX.CONFIG.EVENT_SELECTION_CHANGED, (event) => {
      let shapes = event.elements
      // 控制 toolbar buttons 是否可用
      this.updateToolbarButtonStatus(shapes)

      // let documentEvent = event.documentEvent
      // if (documentEvent && ORYX.CONFIG.CustomConfigs.UI_CONFIG.CUSTOM_CONTEXTMENU) {
      //   console.log(99, documentEvent.button)
      //   if (documentEvent.button === 2) return
      // }

      // Listen to selection change events: show properties
      this.showShapeProperties(shapes)
      if (ORYX.CONFIG.CustomConfigs.UI_CONFIG.Oryx_button_right_top) {
        this.updateOryxButtonPosition(shapes)
      }
    })
  }
  showShapeProperties (shapes) {
    let canvasSelected = false
    if (shapes && shapes.length === 0) {
      shapes = [this.getCanvas()]
      canvasSelected = true
    }
    if (shapes && shapes.length > 0) {
      const selectedShape = shapes.first()
      const stencil = selectedShape.getStencil()

      if (this.selectedElementBeforeScrolling &&
        stencil.id().indexOf('BPMNDiagram') !== -1 &&
        stencil.id().indexOf('CMMNDiagram') !== -1) {
        // ignore canvas event because of empty selection when scrolling stops
        return
      }

      if (this.selectedElementBeforeScrolling &&
        this.selectedElementBeforeScrolling.getId() === selectedShape.getId()) {
        this.selectedElementBeforeScrolling = null
        return
      }

      // Store previous selection
      this.previousSelectedShape = this.selectedShape

      // Only do something if another element is selected (Oryx fires this event multiple times)
      if (this.previousSelectedShape !== undefined &&
        (this.previousSelectedShape.getId() === selectedShape.getId() &&
          selectedShape.getStencil().idWithoutNs() != 'UserTask')) {
        if (this.forceSelectionRefresh) {
          // Switch the flag again, this run will force refresh
          this.forceSelectionRefresh = false
        } else {
          // Selected the same element again, no need to update anything
          return
        }
      }

      let selectedItem = { 'title': '', 'properties': [] }
      if (canvasSelected) {
        selectedItem.auditData = {
          'author': this.modelData.createdByUser,
          'createDate': this.modelData.createDate
        }
      }

      // 获取选中元素的属性
      let properties = stencil.properties()
      for (let i = 0; i < properties.length; i++) {
        let property = properties[i]
        if (!property.popular()) continue
        // let key = property.prefix() + '-' + property.id()
        let key = property.id()

        if (key === 'name') {
          selectedItem.title = selectedShape.properties.get(key)
        }

        // First we check if there is a config for 'key-type' and then for 'type' alone
        // let propertyConfig = this.property_config[key + '-' + property.type()]
        // if (propertyConfig === undefined || propertyConfig === null) {
        //   propertyConfig = this.property_config[property.type()]
        // }

        // if (propertyConfig === undefined || propertyConfig === null) {
        //   console.log('WARNING: no property configuration defined for ' + key + ' of type ' + property.type())
        //   console.warn('警告: 找不到 ' + key + ' of type ' + property.type() + '属性所对应的组件')
        // } else {
          if (selectedShape.properties.get(key) === 'true') {
            selectedShape.properties.set(key, true)
          }

          if (ORYX.CONFIG.CustomConfigs.UI_CONFIG.showRemovedProperties === false && property.isHidden()) {
            continue
          }

          let currentProperty = {
            'key': key,
            'title': property.title(),
            'description': property.description(),
            'type': property.type(),
            'mode': 'read',
            'hidden': property.isHidden(),
            'value': selectedShape.properties.get(key)
          }

          if ((currentProperty.type === 'complex'
            || currentProperty.type === 'multiplecomplex'
            || currentProperty.type === 'List') &&
            currentProperty.value && currentProperty.value.length > 0) {
            try {
              currentProperty.value = JSON.parse(currentProperty.value)
            } catch (err) {
              // ignore
            }
          }

          // if (propertyConfig.readModeTemplateUrl !== undefined && propertyConfig.readModeTemplateUrl !== null) {
          //   currentProperty.readModeTemplateUrl = propertyConfig.readModeTemplateUrl
          // }
          // if (propertyConfig.writeModeTemplateUrl !== null && propertyConfig.writeModeTemplateUrl !== null) {
          //   currentProperty.writeModeTemplateUrl = propertyConfig.writeModeTemplateUrl
          // }
          //
          // if (propertyConfig.templateUrl !== undefined && propertyConfig.templateUrl !== null) {
          //   currentProperty.templateUrl = propertyConfig.templateUrl
          //   currentProperty.hasReadWriteMode = false
          // } else {
          //   currentProperty.hasReadWriteMode = true
          // }

          if (currentProperty.value === undefined
            || currentProperty.value === null
            || currentProperty.value.length === 0) {
            currentProperty.noValue = true
          }

          selectedItem.properties.push(currentProperty)
        // }
      }

      this.selectedItem = selectedItem
      this.selectedShape = selectedShape
      FLOW_eventBus.dispatch(ORYX.CONFIG.EVENT_TYPE_SELECTION_CHANGED, {
        selectedItem,
        selectedShape
      })
    } else {
      this.selectedItem = {}
      this.selectedShape = null
    }
  }
  getNodeOffset (selectedShape) {
    const a = this.getCanvas().node.getScreenCTM() // 获取 svg对象 的转换矩阵CTM
    let absoluteXY = selectedShape.absoluteXY()
    absoluteXY.x *= a.a
    absoluteXY.y *= a.d

    let additionalIEZoom = 1
    additionalIEZoom = ORYX.Utils.IEZoomBelow10(additionalIEZoom)

    const canvasSection = jQuery('#canvasSection')
    if (additionalIEZoom === 1) {
      absoluteXY.y = absoluteXY.y - canvasSection.offset().top
      absoluteXY.x = absoluteXY.x - canvasSection.offset().left
    } else {
      let canvasOffsetLeft = canvasSection.offset().left
      let canvasScrollLeft = canvasSection.scrollLeft()
      let canvasScrollTop = canvasSection.scrollTop()

      let offset = a.e - (canvasOffsetLeft * additionalIEZoom)
      let additionaloffset = 0
      if (offset > 10) {
        additionaloffset = (offset / additionalIEZoom) - offset
      }
      absoluteXY.y = absoluteXY.y - (canvasSection.offset().top * additionalIEZoom) + 5 + ((canvasScrollTop * additionalIEZoom) - canvasScrollTop)
      absoluteXY.x = absoluteXY.x - (canvasOffsetLeft * additionalIEZoom) + additionaloffset + ((canvasScrollLeft * additionalIEZoom) - canvasScrollLeft)
    }

    let bounds = new ORYX.Core.Bounds(
      a.e + absoluteXY.x,
      a.f + absoluteXY.y,
      a.e + absoluteXY.x + a.a * selectedShape.bounds.width(),
      a.f + absoluteXY.y + a.d * selectedShape.bounds.height()
    )

    return bounds
  }
  updateOryxButtonPosition (selectedElements) {
    FLOW_eventBus.dispatch(ORYX.CONFIG.EVENT_TYPE_HIDE_SHAPE_BUTTONS, [
      { type: 'hide_shape_buttons', status: true }
    ])
    let hide_flow_add_btns = true
    let hide_morph_buttons = true
    let hide_edit_buttons = true

    const shapes = selectedElements
    if (shapes && shapes.length === 1) {
      const selectedShape = shapes.first()
      const bounds = this.getNodeOffset(selectedShape)

      const shapeXY = bounds.upperLeft()
      const stencilItem = this.getStencilItemById(selectedShape.getStencil().idWithoutNs())
      let morphShapes = []
      if (stencilItem && stencilItem.morphRole) {
        for (let i = 0; i < this.morphRoles.length; i++) {
          if (this.morphRoles[i].role === stencilItem.morphRole) {
            if (!this.morphRoles[i].hideMorphButton) {
              morphShapes = this.morphRoles[i].morphOptions
            }
          }
        }
      }

      let x = shapeXY.x
      // 如果元素不够宽, 把左边2个按钮往左移，防止溢出
      if (bounds.width() < 48) {
        x -= 24
      }

      if (morphShapes && morphShapes.length > 0) {
        hide_morph_buttons = false
      }

      if (ORYX.CONFIG.CustomConfigs.UI_CONFIG.Oryx_button_left_bottom) {
        let flow_op_btns = document.getElementById('flow_op_btns')
        flow_op_btns.style.left = x + 'px'
        flow_op_btns.style.top = (shapeXY.y + bounds.height() + 4) + 'px'
      }

      let editable = selectedShape._stencil._jsonStencil.id.endsWith('CollapsedSubProcess')
      hide_edit_buttons = !editable

      if (stencilItem &&
        (stencilItem.canConnect
          || (stencilItem.canConnectAssociation && stencilItem.id !== 'FlowBox'))) {
        let quickButtonX = shapeXY.x + bounds.width() + 7
        let quickButtonY = shapeXY.y
        let flow_add_btns = document.getElementById('flow_add_btns')
        flow_add_btns.style.left = quickButtonX + 'px'
        flow_add_btns.style.top = quickButtonY + 'px'
        hide_flow_add_btns = false
      }

      // this.updateResizerPosition(shapeXY, bounds)
      FLOW_eventBus.dispatch(ORYX.CONFIG.EVENT_TYPE_HIDE_SHAPE_BUTTONS, [
        { type: 'hide_shape_buttons', status: false },
        { type: 'hide_flow_add_btns', status: hide_flow_add_btns },
        { type: 'hide_morph_buttons', status: hide_morph_buttons },
        { type: 'hide_edit_buttons', status: hide_edit_buttons },
      ])
    }
  }
  updateResizerPosition(point, bounds) {
    let width = bounds.width()
    let height = bounds.height()
    let resizer_southeast = document.getElementsByClassName('resizer_southeast')[0]
    resizer_southeast.style.left = point.x + width + 3 + 'px'
    resizer_southeast.style.top = point.y + height + 3+ 'px'
    let resizer_northwest = document.getElementsByClassName('resizer_northwest')[0]
    resizer_northwest.style.left = point.x -13 + 'px'
    resizer_northwest.style.top = point.y - 13 + 'px'
    let resizer_south = document.getElementsByClassName('resizer_south')[0]
    resizer_south.style.left = point.x + 'px'
    resizer_south.style.top = point.y + height + 5 + 'px'
    let resizer_north = document.getElementsByClassName('resizer_north')[0]
    resizer_north.style.left = point.x + 'px'
    resizer_north.style.top = point.y - 5 + 'px'
    let resizer_west = document.getElementsByClassName('resizer_west')[0]
    resizer_west.style.left = point.x - 5 + 'px'
    resizer_west.style.top = point.y + 'px'
    let resizer_east = document.getElementsByClassName('resizer_east')[0]
    resizer_east.style.left = point.x + width + 5 + 'px'
    resizer_east.style.top = point.y + 'px'
  }
  updateToolbarButtonStatus (elements) {
    for (let i = 0; i < this.toolbarItems.length; i++) {
      let item = this.toolbarItems[i]
      if (item.enabledAction && item.enabledAction === 'element') {
        let minLength = 1
        if (item.minSelectionCount) {
          minLength = item.minSelectionCount
        }
        if (elements.length >= minLength && !item.enabled) {
          item.enabled = true
        } else if (elements.length == 0 && item.enabled) {
          item.enabled = false
        }
      }
    }
  }
  initAddListener (editorManager) {
    FLOW_eventBus.addListener(ORYX.CONFIG.EVENT_TYPE_EDITOR_READY, () => {
      var url = window.location.href
      var regex = new RegExp('[?&]subProcessId(=([^&#]*)|&|#|$)')
      var results = regex.exec(url)
      if (results && results[2]) {
        editorManager.edit(decodeURIComponent(results[2].replace(/\+/g, ' ')))
      }
    })
    FLOW_eventBus.addListener(ORYX.CONFIG.EVENT_TYPE_UNDO_REDO_RESET, function () {
      if (this.items) {
        for (let i = 0; i < this.items.length; i++) {
          let item = this.items[i]
          if (item.action === 'FLOWABLE.TOOLBAR.ACTIONS.undo' || item.action === 'FLOWABLE.TOOLBAR.ACTIONS.redo') {
            item.enabled = false
          }
        }
      }

    }, this)
    FLOW_eventBus.addListener(ORYX.CONFIG.EVENT_TYPE_SHOW_VALIDATION_POPUP, function (event) {
      // Method to open validation dialog
      var showValidationDialog = function () {
        this.currentValidationId = event.validationId
        this.isOnProcessLevel = event.onProcessLevel

        _internalCreateModal({ template: 'editor-app/popups/validation-errors.html?version=' + Date.now() }, $modal, this)
      }

      showValidationDialog()
    })
    FLOW_eventBus.addListener(ORYX.CONFIG.EVENT_TYPE_NAVIGATE_TO_PROCESS, function (event) {
      var modelMetaData = editorManager.getBaseModelData()
      this.editorHistory.push({
        id: modelMetaData.modelId,
        name: modelMetaData.name,
        type: 'bpmnmodel'
      })

      $window.location.href = '../editor/#/editor/' + event.processId
    })
  }
  clearAllEvents () {
    FLOW_eventBus.removeAllListener()
    this.editor.clearAllEventListeners()
  }
}
