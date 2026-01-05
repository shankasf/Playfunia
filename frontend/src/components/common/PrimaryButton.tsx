import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

import styles from "./PrimaryButton.module.css";

type CommonProps = {
  className?: string;
  children: ReactNode;
};

type LinkButtonProps = CommonProps &
  Omit<LinkProps, "to" | "className" | "children"> & {
    to: string;
    href?: undefined;
  };

type AnchorButtonProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children"> & {
    href: string;
    to?: undefined;
  };

type RegularButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "href"> & {
    href?: undefined;
    to?: undefined;
  };

type ButtonProps = LinkButtonProps | AnchorButtonProps | RegularButtonProps;

export function PrimaryButton(props: ButtonProps) {
  const classes = `${styles.button} ${props.className ?? ""}`.trim();

  if ("to" in props) {
    const { to, className: _className, children, ...rest } = props as LinkButtonProps;
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  if ("href" in props && props.href) {
    const { href, className: _className, children, ...rest } = props as AnchorButtonProps;
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  const { className: _className, children, ...rest } = props as RegularButtonProps;
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
