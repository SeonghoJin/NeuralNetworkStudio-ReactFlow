import { MouseEvent as ReactMouseEvent } from 'react';

import { getHostForElement } from '../../utils';

import {
  ElementId,
  XYPosition,
  OnConnectFunc,
  OnConnectStartFunc,
  OnConnectStopFunc,
  OnConnectEndFunc,
  ConnectionMode,
  SetConnectionId,
  Connection,
  HandleType,
} from '../../types';

type ValidConnectionFunc = (connection: Connection) => boolean;
export type SetSourceIdFunc = (params: SetConnectionId) => void;

export type SetPosition = (pos: XYPosition) => void;

type Result = {
  elementBelow: Element | null;
  isValid: boolean;
  connection: Connection;
  isHoveringHandle: boolean;
};

function getCheckElementBelowIsValidResult(
  elementBelow : Element | null,
  elementBelowIsTarget : boolean,
  elementBelowIsSource : boolean,
  isTarget : boolean,
  connectionMode : ConnectionMode,
  nodeId : ElementId,
  handleId : ElementId | null,
  isValidConnection : ValidConnectionFunc,
){
  const result: Result = {
    elementBelow,
    isValid: false,
    connection: { source: null, target: null, sourceHandle: null, targetHandle: null },
    isHoveringHandle: false,
  };

  if (elementBelow && (elementBelowIsTarget || elementBelowIsSource)) {
    result.isHoveringHandle = true;

    // in strict mode we don't allow target to target or source to source connections
    const isValid =
      connectionMode === ConnectionMode.Strict
        ? (isTarget && elementBelowIsSource) || (!isTarget && elementBelowIsTarget)
        : true;

    if (isValid) {
      const elementBelowNodeId = elementBelow.getAttribute('data-nodeid');
      const elementBelowHandleId = elementBelow.getAttribute('data-handleid');
      const connection: Connection = isTarget
        ? {
          source: elementBelowNodeId,
          sourceHandle: elementBelowHandleId,
          target: nodeId,
          targetHandle: handleId,
        }
        : {
          source: nodeId,
          sourceHandle: handleId,
          target: elementBelowNodeId,
          targetHandle: elementBelowHandleId,
        };

      result.connection = connection;
      result.isValid = isValidConnection(connection);
    }
  }

  return result;
}

// checks if element below mouse is a handle and returns connection in form of an object { source: 123, target: 312 }
function checkElementBelowIsValid(
  event: MouseEvent,
  connectionMode: ConnectionMode,
  isTarget: boolean,
  nodeId: ElementId,
  handleId: ElementId | null,
  isValidConnection: ValidConnectionFunc,
  doc: Document | ShadowRoot
) {
  const elementBelow = doc.elementFromPoint(event.clientX, event.clientY);
  const elementBelowIsTarget = elementBelow?.classList.contains('target') || false;
  const elementBelowIsSource = elementBelow?.classList.contains('source') || false;
  const elementIsNode = !!elementBelow?.closest('.react-flow__node');

  if(elementIsNode){
    const reactFlowNode = (event.target as Element).closest('.react-flow');
    if(!reactFlowNode) throw new DOMException("ReactFlowNode가 존재하지 않습니다.");
    if(!elementBelow) throw new DOMException("elementBelow가 존재하지 않습니다.");

    const children = elementBelow.querySelectorAll(`${isTarget ? '.source' : '.target'}`);
    const childrenLength = children.length;

    for(let i = 0; i < childrenLength; i++){
      const item = children.item(i);
      if(!item)throw new DOMException("존재하지 않는 Handle입니다.");

      const childrenIsTarget = item.classList.contains('target');
      const childrenIsSource = item.classList.contains('source');

      if(isTarget != childrenIsTarget){
        return getCheckElementBelowIsValidResult(
          item,
          childrenIsTarget,
          childrenIsSource,
          isTarget,
          connectionMode,
          nodeId,
          handleId,
          isValidConnection
        )
      }
    }
  }

  return getCheckElementBelowIsValidResult(
    elementBelow,
    elementBelowIsTarget,
    elementBelowIsSource,
    isTarget,
    connectionMode,
    nodeId,
    handleId,
    isValidConnection
  );
}

function resetRecentHandle(hoveredHandle: Element): void {
  hoveredHandle?.classList.remove('react-flow__handle-valid');
  hoveredHandle?.classList.remove('react-flow__handle-connecting');
}

export function onMouseDown(
  event: ReactMouseEvent,
  handleId: ElementId | null,
  nodeId: ElementId,
  setConnectionNodeId: SetSourceIdFunc,
  setPosition: SetPosition,
  onConnect: OnConnectFunc,
  isTarget: boolean,
  isValidConnection: ValidConnectionFunc,
  connectionMode: ConnectionMode,
  elementEdgeUpdaterType?: HandleType,
  onEdgeUpdateEnd?: (evt: MouseEvent) => void,
  onConnectStart?: OnConnectStartFunc,
  onConnectStop?: OnConnectStopFunc,
  onConnectEnd?: OnConnectEndFunc
): void {
  const reactFlowNode = (event.target as Element).closest('.react-flow');
  // when react-flow is used inside a shadow root we can't use document
  const doc = getHostForElement(event.target as HTMLElement);

  if (!doc) {
    return;
  }

  const elementBelow = doc.elementFromPoint(event.clientX, event.clientY);
  const elementBelowIsTarget = elementBelow?.classList.contains('target');
  const elementBelowIsSource = elementBelow?.classList.contains('source');

  if (!reactFlowNode || (!elementBelowIsTarget && !elementBelowIsSource && !elementEdgeUpdaterType)) {
    return;
  }

  const handleType = elementEdgeUpdaterType ? elementEdgeUpdaterType : elementBelowIsTarget ? 'target' : 'source';
  const containerBounds = reactFlowNode.getBoundingClientRect();
  let recentHoveredHandle: Element;

  setPosition({
    x: event.clientX - containerBounds.left,
    y: event.clientY - containerBounds.top,
  });

  setConnectionNodeId({ connectionNodeId: nodeId, connectionHandleId: handleId, connectionHandleType: handleType });
  onConnectStart?.(event, { nodeId, handleId, handleType });

  function onMouseMove(event: MouseEvent) {
    setPosition({
      x: event.clientX - containerBounds.left,
      y: event.clientY - containerBounds.top,
    });

    const { connection, elementBelow, isValid, isHoveringHandle } = checkElementBelowIsValid(
      event,
      connectionMode,
      isTarget,
      nodeId,
      handleId,
      isValidConnection,
      doc
    );

    if (!isHoveringHandle) {
      return resetRecentHandle(recentHoveredHandle);
    }

    const isOwnHandle = connection.source === connection.target;

    if (!isOwnHandle && elementBelow) {
      recentHoveredHandle = elementBelow;
      elementBelow.classList.add('react-flow__handle-connecting');
      elementBelow.classList.toggle('react-flow__handle-valid', isValid);
    }
  }

  function onMouseUp(event: MouseEvent) {
    const { connection, isValid } = checkElementBelowIsValid(
      event,
      connectionMode,
      isTarget,
      nodeId,
      handleId,
      isValidConnection,
      doc
    );

    onConnectStop?.(event);

    if (isValid) {
      onConnect?.(connection);
    }

    onConnectEnd?.(event);

    if (elementEdgeUpdaterType && onEdgeUpdateEnd) {
      onEdgeUpdateEnd(event);
    }

    resetRecentHandle(recentHoveredHandle);
    setConnectionNodeId({ connectionNodeId: null, connectionHandleId: null, connectionHandleType: null });

    doc.removeEventListener('mousemove', onMouseMove as EventListenerOrEventListenerObject);
    doc.removeEventListener('mouseup', onMouseUp as EventListenerOrEventListenerObject);
  }

  doc.addEventListener('mousemove', onMouseMove as EventListenerOrEventListenerObject);
  doc.addEventListener('mouseup', onMouseUp as EventListenerOrEventListenerObject);
}
