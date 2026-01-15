export const toolList = {
  left: [{
    label: 'Insert Row Above',
    action: 'insert',
    location: 'previous',
    target: 'row'
  }, {
    label: 'Insert Row Below',
    action: 'insert',
    location: 'next',
    target: 'row'
  }, {
    label: 'Remove Row',
    action: 'remove',
    location: 'current',
    target: 'row'
  }, {
    label: 'separator'
  }, {
    label: 'Resize Table',
    action: 'table',
    target: 'table'
  }, {
    label: 'Align Left',
    action: 'left',
    target: 'table'
  }, {
    label: 'Align Center',
    action: 'center',
    target: 'table'
  }, {
    label: 'Align Right',
    action: 'right',
    target: 'table'
  }, {
    label: 'Delete Table',
    action: 'delete',
    target: 'table'
  }],
  bottom: [{
    label: 'Insert Column Left',
    action: 'insert',
    location: 'left',
    target: 'column'
  }, {
    label: 'Insert Column Right',
    action: 'insert',
    location: 'right',
    target: 'column'
  }, {
    label: 'Remove Column',
    action: 'remove',
    location: 'current',
    target: 'column'
  }, {
    label: 'separator'
  }, {
    label: 'Resize Table',
    action: 'table',
    target: 'table'
  }, {
    label: 'Align Left',
    action: 'left',
    target: 'table'
  }, {
    label: 'Align Center',
    action: 'center',
    target: 'table'
  }, {
    label: 'Align Right',
    action: 'right',
    target: 'table'
  }, {
    label: 'Delete Table',
    action: 'delete',
    target: 'table'
  }]
}
