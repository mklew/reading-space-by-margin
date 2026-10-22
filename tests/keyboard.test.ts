import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {defaults,effectiveShortcuts,shortcutAction,shortcutsSchema} from '../src/keyboard';

test('default actions, replacement bindings and disabled shortcuts',()=>{
  for(const [action,key] of Object.entries(defaults))assert.equal(shortcutAction({key}),action);
  assert.equal(shortcutAction({key:'x'},{capture:'x'}),'capture');
  assert.equal(shortcutAction({key:'n'},{capture:'x'}),null);
  assert.equal(shortcutAction({key:'n'},{capture:''}),null);
  assert.equal(effectiveShortcuts({capture:''}).search,'/');
});

test('validation normalizes keys and rejects invalid keys and effective conflicts',()=>{
  assert.deepEqual(shortcutsSchema.parse({capture:'X'}),{capture:'x'});
  for(const value of [' ','Enter','\n','\u0000','ab'])assert.equal(shortcutsSchema.safeParse({capture:value}).success,false);
  assert.equal(shortcutsSchema.safeParse({capture:'j'}).success,false);
  assert.equal(shortcutsSchema.safeParse({capture:'x',search:'X'}).success,false);
  assert.equal(shortcutsSchema.safeParse({capture:'j',next:''}).success,true);
  assert.equal(shortcutsSchema.safeParse({capture:'',search:''}).success,true);
  assert.equal(shortcutsSchema.safeParse({unknown:'z'}).success,false);
});

test('typing, compositions, repeats and modified keypresses do not invoke commands',()=>{
  for(const flag of ['ctrlKey','altKey','metaKey','repeat','isComposing','defaultPrevented']){
    assert.equal(shortcutAction({key:'n',[flag]:true}),null,flag);
  }
  assert.equal(shortcutAction({key:'/',shiftKey:true}),'search');
  const dom=new JSDOM('<input><textarea></textarea><select></select><div contenteditable="true"><span>text</span></div><button>Read</button>');
  try{
    for(const selector of ['input','textarea','select','span'])assert.equal(shortcutAction({key:'n',target:dom.window.document.querySelector(selector)}),null,selector);
    assert.equal(shortcutAction({key:'n',target:dom.window.document.querySelector('button')}),'capture');
  }finally{dom.window.close();}
});
