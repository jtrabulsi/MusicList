import React from 'react';
import { connect } from 'react-redux';
import { checkSession } from '../actions/authentication';

import Template from './Template';

class TemplateContainer extends React.Component {
  constructor(props) {
    super(props);

    // bound functions
    this.checkUserSession = this.checkUserSession.bind(this);
  }

  async componentWillMount() {
    // Before the component mounts, check for an existing user session
    await this.checkUserSession();
    // replace this console.log with whatever code that relies on checkUserSession to have completed
    console.log('test');
  }

  async checkUserSession() {
    const { dispatch } = this.props;
    await dispatch(checkSession());
  }

  render() {
    const { authentication, progress } = this.props;
    return (
      <Template progress={progress} authentication={authentication} />
    );
  }
}

function mapStateToProps(state) {
  return {
    progress: state.progress,
    authentication: state.authentication,
  };
}

export default connect(mapStateToProps)(TemplateContainer);