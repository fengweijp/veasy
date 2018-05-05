// @flow
/* eslint-disable no-param-reassign */
import is from 'is_js';
// eslint-disable-next-line max-len
import type {ComponentState, FieldSchema, FieldState, HandlerFunc, Schema, Matcher, FieldRules, BeforeValidationHandler} from "../flowTypes";
import {getNestedValue} from "./collectValuesUtils";
import {FieldStatus, throwError} from "./helpers";
import handlerMatcher, {
  RuleWhichNeedsArray,
  RuleWhichNeedsBoolean
} from "../ruleHandlers/matchers";
import {createNewFieldState} from './initializationUtils';

/**
 * If all fields in the state has their status !== error
 * Then we will set the isFormOK to true then return the state.
 * Just mutate the value since it's already a new state object
 *
 */
export function checkIsFormOK(
  schema: Schema,
  componentState: ComponentState
) {
  const properties = Object.keys(schema);
  let isError = false;
  properties.some(prop => {
    if (prop === 'collectValues') return false;

    if (
      is.propertyDefined(schema[prop], 'isRequired') &&
      schema[prop].isRequired === false &&
      componentState[prop].status !== FieldStatus.error
    )
      return false;

    if (componentState[prop].status === FieldStatus.error) {
      isError = true;
      return true;
    }

    if (componentState[prop].status === FieldStatus.normal) {
      if (is.not.propertyDefined(schema[prop], 'default')) {
        isError = true;
        return true;
      }

      if (schema[prop].default !== componentState[prop].value) {
        isError = true;
        return true;
      }
    }
    return false;
  });
  componentState.isFormOK = !isError;

  return componentState;
}



function handleBeforeValidation(
  fieldValue: mixed,
  handler: BeforeValidationHandler
) {
  if (is.function(handler)) {
    return handler(fieldValue);
  }
  return fieldValue;
}



function extractUserDefinedMsg(
  handlerName: string,
  schema: FieldRules
) {
  const result = { schema, userErrorText: '' };

  // No user message, just return
  if (is.not.array(schema[handlerName])) return result;

  const currentSchema = schema[handlerName];

  // Handle the case where the value of rule is array
  if (RuleWhichNeedsArray.includes(handlerName)) {
    // No user message, just return
    if (is.not.array(currentSchema[0])) return result;
  }

  // The most common case: [0] is rule and [1] is errText
  const [rule, errText] = currentSchema;
  result.schema[handlerName] = rule;
  result.userErrorText = errText;
  return result;
}



function ruleRunner(
  ruleName: string,
  ruleHandler: HandlerFunc,
  fieldName: string,
  value: mixed,
  fieldRules: FieldRules
) {
  const { schema, userErrorText } = extractUserDefinedMsg(
    ruleName,
    fieldRules
  );

  if (RuleWhichNeedsBoolean.includes(ruleName)) {
    if (schema[ruleName] === false) return;
  }

  const result = ruleHandler(fieldName, value, schema);
  if (result.isValid) return;

  throwError(value, userErrorText || result.errorText);
}

function grabValueForReliesField(
  allSchema,
  allState,
  reliedFieldName
) {
  let result;

  if (
    is.propertyDefined(allState, reliedFieldName) &&
    is.propertyDefined(allState[reliedFieldName], "value")
  ) {
    result = allState[reliedFieldName].value
  }
  else if (
    is.propertyDefined(allSchema, "collectValues") &&
    is.propertyDefined(allSchema.collectValues, reliedFieldName)
  ) {
    result = getNestedValue(
      allSchema.collectValues[reliedFieldName],
      allState
    )
  }

  return result;
}

function handleReliesOn(
  fieldReliesOnSchema: {},
  fieldState: FieldState,
  allSchema: Schema,
  allState: ComponentState
) {
  const originalFieldState = {...fieldState};
  Object.keys(fieldReliesOnSchema).forEach(reliedFieldName => {
    const reliesKeySchema = fieldReliesOnSchema[reliedFieldName];
    Object.keys(reliesKeySchema).forEach(rule => {

      if (is.not.propertyDefined(handlerMatcher, rule)) return;

      const reliedFieldValue = grabValueForReliesField(
        allSchema,
        allState,
        reliedFieldName
      );

      try {
        ruleRunner(
          rule,
          handlerMatcher[rule],
          reliedFieldName,
          reliedFieldValue, // Here we need to swap the field value to the target value
          reliesKeySchema
        );
      } catch (err) {
        // Restore the original value
        err.value = originalFieldState.value;
        throw err;
      }
    });
  });
}



/**
 * It will run through the user's settings for a field,
 * and try matching to the matchers.js,
 * if according rule could be found,
 * it will then execute the according rule function.
 * For instance:
 * if user sets a `minLength` for a field,
 * This function will invoke the minLength()
 *
 */
function runMatchers(
  matcher: Matcher,
  fieldState: FieldState,
  fieldSchema: FieldSchema,
  allSchema?: Schema,
  allState?: ComponentState
) {
  const fieldName = Object.keys(fieldSchema)[0];
  const fieldRules = fieldSchema[fieldName];
  Object.keys(fieldRules).forEach(ruleInSchema => {
    if (is.propertyDefined(matcher, ruleInSchema)) {
      // eslint-disable-next-line no-use-before-define
      ruleRunner(
        ruleInSchema,
        matcher[ruleInSchema],
        fieldName,
        fieldState.value,
        fieldRules
      );
    }
    else if (ruleInSchema === 'beforeValidation') {
      fieldState.value = handleBeforeValidation(
        fieldState.value,
        fieldRules.beforeValidation
      );
    }
    else if (ruleInSchema === 'reliesOn') {
      const fieldReliesOnSchema = fieldSchema[fieldName].reliesOn;
      if (allSchema && allState) {
        handleReliesOn(
          fieldReliesOnSchema,
          fieldState,
          allSchema,
          allState
        )
      }
    }
    // TODO: Do something when the rule is not match
    // else if (ruleInSchema !== 'default') {
    // }
  });
  return fieldState;
}



/**
 * This is the main entry for all validator.
 * It will generate the initial state to start with
 *
 */
export function rulesRunner(
  value: mixed,
  fieldSchema: FieldSchema,
  allSchema?: Schema,
  allState?: ComponentState
) {
  const fieldState = createNewFieldState();
  fieldState.value = value;

  if (is.existy(value) && is.not.empty(value)) {
    fieldState.status = FieldStatus.ok;
  }

  return runMatchers(
    handlerMatcher,
    fieldState,
    fieldSchema,
    allSchema,
    allState
  );
}
