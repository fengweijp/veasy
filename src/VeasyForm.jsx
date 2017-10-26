/* eslint-disable react/forbid-prop-types,import/no-extraneous-dependencies */
import is from 'is_js';
import PropTypes from 'prop-types';
import React from 'react';
import * as lib from './helpers';

export default class VeasyForm extends React.Component {
  triggerValidation = e => {
    e.preventDefault();
    const { schema, allState, update } = this.props;
    lib.startValidating(e.target, schema, update, allState);
  };

  handleOnChange = e => this.triggerValidation(e);

  handleBlur = e => this.triggerValidation(e);

  isRegisteredComponent = (child, childName) => {
    if (is.string(child.type)) {
      // Skip HTML element
      if (is.lowerCase(child.type[0])) return false;
    }

    const names = Object.keys(this.props.schema);
    if (React.isValidElement(child) && names.includes(childName)) {
      return true;
    }
    return false;
  };

  cloneElement = (child, childName) => {
    const childProp = this.props.allState[childName];
    return React.cloneElement(child, {
      status: childProp.status,
      errorText: childProp.errorText,
      value: childProp.value
    });
  };

  recursiveCloneChildren = children =>
    React.Children.map(children, child => {
      const childName = child.props.name;
      if (this.isRegisteredComponent(child, childName)) {
        return this.cloneElement(child, childName);
      }

      const childProps = {};
      if (child.props) {
        // String has no Prop
        childProps.children = this.recursiveCloneChildren(child.props.children);
        return React.cloneElement(child, childProps);
      }
      return child;
    });

  handleReset = e => {
    e.preventDefault();
    const { update, schema, allState } = this.props;
    update(lib.resetForm(schema, allState));
  };

  render() {
    const { schema, allState, update, children, ...reset } = this.props;

    return (
      <form
        onChange={this.handleOnChange}
        onBlur={this.handleBlur}
        onReset={this.handleReset}
        {...reset}
      >
        {this.recursiveCloneChildren(children)}
      </form>
    );
  }
}

VeasyForm.defaultProps = {
  allState: undefined
};

VeasyForm.propTypes = {
  schema: PropTypes.object.isRequired,
  allState: PropTypes.object,
  update: PropTypes.func.isRequired,
  children: PropTypes.any.isRequired
};
