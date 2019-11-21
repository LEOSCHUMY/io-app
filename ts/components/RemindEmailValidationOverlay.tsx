/**
 * A component to remind the user to validate his/her email
 */
import I18n from "i18n-js";
import * as pot from "italia-ts-commons/lib/pot";
import { Millisecond } from "italia-ts-commons/lib/units";
import { Button, Content, H2, Text, View } from "native-base";
import * as React from "react";
import { BackHandler, Image, StyleSheet, Alert } from "react-native";
import { connect } from "react-redux";
import { isEmailEditingAndValidationEnabled } from "../config";
import {
  navigateBack,
  navigateToEmailInsertScreen
} from "../store/actions/navigation";
import { emailAcknowledged, abortOnboarding } from "../store/actions/onboarding";
import {
  loadProfileRequest,
  startEmailValidation
} from "../store/actions/profile";
import { Dispatch } from "../store/actions/types";
import { emailValidationSelector } from "../store/reducers/emailValidation";
import { isOnboardingCompletedSelector } from "../store/reducers/navigationHistory";
import {
  emailProfileSelector,
  isProfileEmailValidatedSelector,
  profileSelector
} from "../store/reducers/profile";
import { GlobalState } from "../store/reducers/types";
import { showToast } from "../utils/showToast";
import { withLoadingSpinner } from "./helpers/withLoadingSpinner";
import TopScreenComponent, {
  TopScreenComponentProps
} from "./screens/TopScreenComponent";
import FooterWithButtons from "./ui/FooterWithButtons";
import Markdown from "./ui/Markdown";
import IconFont from "./ui/IconFont";

type Props = ReturnType<typeof mapDispatchToProps> &
  ReturnType<typeof mapStateToProps>;

type State = {
  ctaSendEmailValidationText: string;
  isCtaSentEmailValidationDisabled: boolean;
  closedByUser: boolean;
  isContentLoadCompleted: boolean;
};

const styles = StyleSheet.create({
  imageChecked: {
    alignSelf: "center"
  },
  emailTitle: {
    textAlign: "center"
  }
});

const emailSentTimeout = 10000 as Millisecond; // 10 seconds

const EMPTY_EMAIL = "";

class RemindEmailValidationOverlay extends React.PureComponent<Props, State> {
  private idTimeout?: number;
  private idPolling?: number;
  
  constructor(props: Props) {
    super(props);
    this.state = {
      ctaSendEmailValidationText: I18n.t("email.validate.cta"),
      isCtaSentEmailValidationDisabled: false,
      closedByUser: false,
      isContentLoadCompleted: false
    };
  }

  public componentDidMount() {
    BackHandler.addEventListener("hardwareBackPress", this.props.navigateBack);

    // Periodically (20 seconds) check if the user validate his own email address
    // tslint:disable-next-line: no-object-mutation
    this.idPolling = setInterval(this.props.updateValidationInfo, 20000);
  }

  public componentWillUnmount() {
    BackHandler.removeEventListener(
      "hardwareBackPress",
      this.props.navigateBack
    );
    // if a timeout is running we have to stop it
    if (this.idTimeout !== undefined) {
      clearTimeout(this.idTimeout);
    }
    clearInterval(this.idPolling);

    if (this.props.isEmailValid && !this.state.closedByUser) {
      // If the compoment is unmounted without the user iteracion, a toast is displayed
      // TODO: we could use the toast as customized within https://www.pivotaltracker.com/story/show/169568823
      showToast(
        "La mail è stata validata! Ora puoi accedere a tutte le funzionalità di IO.",
        "success"
      );
    }
  }

  private handleSendEmailValidationButton = () => {
    // send email validation only if it exists
    this.props.optionEmail.map(_ => {
      this.props.sendEmailValidation();
    });
    this.setState({
      isCtaSentEmailValidationDisabled: true
    });
  };

  private handleOnClose = () => {
    this.setState({ closedByUser: true });
    this.props.updateValidationInfo();
    if (!this.props.isOnboardingCompleted) {
      this.props.acknowledgeEmailInsert();
    }
  };

  public componentDidUpdate(prevProps: Props) {
    // In the case where the request has been made and the user's email is still invalid,
    // the navigateBack is called, otherwise the component will be automatically
    // unmounted by the withValidatedEmail HOC and the WrappedCompoent is displayed
    if (
      this.state.closedByUser &&
      !prevProps.isEmailValid &&
      !this.props.isEmailValid
    ) {
      this.props.navigateBack();
    }

    // if we were sending again the validation email
    if (pot.isLoading(prevProps.emailValidation)) {
      // and we got an error
      if (pot.isError(this.props.emailValidation)) {
        this.setState({
          isCtaSentEmailValidationDisabled: false
        });
      } else if (pot.isSome(this.props.emailValidation)) {
        // schedule a timeout to make the cta button disabled and reporting
        // the string that email has been sent.
        // after timeout we restore the default state
        // tslint:disable-next-line: no-object-mutation
        this.idTimeout = setTimeout(() => {
          // tslint:disable-next-line: no-object-mutation
          this.idTimeout = undefined;
          this.setState({
            ctaSendEmailValidationText: I18n.t("email.validate.cta"),
            isCtaSentEmailValidationDisabled: false
          });
        }, emailSentTimeout);
        this.setState({
          ctaSendEmailValidationText: I18n.t("email.validate.sent")
        });
      }
    }
  }

  private contextualHelp = {
    title: I18n.t("email.validate.title"),
    body: () => <Markdown>{I18n.t("email.validate.help")}</Markdown>
  };

  private handleOnboardingGoBack = () =>
    Alert.alert(
      I18n.t("onboarding.alert.title"),
      I18n.t("onboarding.alert.description"),
      [
        {
          text: I18n.t("global.buttons.cancel"),
          style: "cancel"
        },
        {
          text: I18n.t("global.buttons.exit"),
          style: "default",
          onPress: () => this.props.abortOnboarding()
        }
      ]
    ); 

  private customOnboardingGoBack = (
    <IconFont
      name={"io-back"}
      onPress={this.handleOnboardingGoBack}
    />
  );

  private onMainProps: TopScreenComponentProps = {
    customRightIcon: {
      iconName: "io-close",
      onPress: this.props.navigateBack,
    }
  };

  private onBoardingProps: TopScreenComponentProps = {
    headerTitle: I18n.t("email.validate.header"),
    title: I18n.t("email.validate.title"),
    customGoBack: this.customOnboardingGoBack
  };

  public render() {
    const email = this.props.optionEmail.getOrElse(EMPTY_EMAIL);
    const { isOnboardingCompleted } = this.props;
    return (
      <TopScreenComponent
        {...(isOnboardingCompleted ? this.onMainProps : this.onBoardingProps)}
        contextualHelp={this.contextualHelp}
      >
        <Content>
          {isOnboardingCompleted && (
            <React.Fragment>
              <Image
                style={styles.imageChecked}
                source={require("../../img/email-checked-icon.png")}
              />
              <View spacer={true} extralarge={true} />
            </React.Fragment>
          )}
          <H2 style={isOnboardingCompleted ? styles.emailTitle: undefined}>{I18n.t("email.validate.title")}</H2>
          <View spacer={true} />
          <Markdown onLoadEnd={() => this.setState({ isContentLoadCompleted: true })}>
            {isOnboardingCompleted
              ? I18n.t("email.validate.content2", { email })
              : I18n.t("email.validate.content1", { email })}
          </Markdown>
          <View spacer={true} />
          {this.state.isContentLoadCompleted &&
            <Button
              block={true}
              light={true}
              bordered={true}
              disabled={this.state.isCtaSentEmailValidationDisabled}
              onPress={this.handleSendEmailValidationButton}
            >
              <Text>{this.state.ctaSendEmailValidationText}</Text>
            </Button>
          }
        </Content>
          <FooterWithButtons
            type={"TwoButtonsInlineThirdInverted"}
            leftButton={{
              block: true,
              bordered: true,
              onPress: this.props.navigateToEmailInsertScreen,
              title: I18n.t("email.edit.title")
            }}
            rightButton={{
              block: true,
              primary: true,
              onPress: this.handleOnClose,
              title: isOnboardingCompleted
                ? I18n.t("global.buttons.ok")
                : I18n.t("global.buttons.continue")
            }}
          />
      </TopScreenComponent>
    );
  }
}

const mapStateToProps = (state: GlobalState) => {
  const isEmailValidated = isProfileEmailValidatedSelector(state);
  const emailValidation = emailValidationSelector(state);
  const potProfile = profileSelector(state);
  return {
    emailValidation,
    optionEmail: emailProfileSelector(state),
    isEmailValid: isEmailEditingAndValidationEnabled ? isEmailValidated : true,
    potProfile,
    // show loader until the profile refresh is completed
    isLoading: pot.isLoading(potProfile),
    isOnboardingCompleted: isOnboardingCompletedSelector(state)
  };
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
  sendEmailValidation: () => dispatch(startEmailValidation.request()),
  navigateBack: () => dispatch(navigateBack()),
  updateValidationInfo: () => {
    // Refresh profile to check if the email address has been validated
    dispatch(loadProfileRequest());
  },
  navigateToEmailInsertScreen: () => {
    dispatch(navigateToEmailInsertScreen());
  },
  acknowledgeEmailInsert: () => dispatch(emailAcknowledged()),
  abortOnboarding: () => dispatch(abortOnboarding())
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withLoadingSpinner(RemindEmailValidationOverlay));