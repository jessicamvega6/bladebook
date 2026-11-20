package com.bladebook.api.client.security;

import com.amazonaws.serverless.proxy.RequestReader;
import com.amazonaws.serverless.proxy.model.AwsProxyRequestContext;
import com.bladebook.core.data.AccessLog;
import com.bladebook.core.data.CloudWatchAccessLog;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.MethodParameter;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.io.IOException;
import java.time.Clock;
import java.util.UUID;

/**
 * The access log's request side (ADR-MASTER section 18). A filter, straight after {@link OriginCheck}, opens each
 * request's lines with API Gateway's request ID and the visitor's address; the core services add lines as they read; and
 * every response body is held until the lines are written ({@link AccessLog#flush}). A failed write fails the request,
 * so nothing it read is sent (I12, 2026-11-17).
 *
 * <p>On AWS the visitor's address is CloudFront's {@code x-bladebook-viewer-ip}, trusted because {@link OriginCheck} has
 * already refused anything that didn't come through CloudFront; locally it's the socket's address.
 */
@Configuration
public class AccessLogging {

    /** Written by CloudFront's viewer-request function (infra/lib/website.ts, VIEWER_IP_HEADER). */
    static final String VIEWER_IP = "x-bladebook-viewer-ip";

    @Bean
    FilterRegistrationBean<OncePerRequestFilter> accessLogFilter(Environment env) {
        boolean local = env.matchesProfiles("local");
        FilterRegistrationBean<OncePerRequestFilter> reg = new FilterRegistrationBean<>(new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                AccessLog.begin(requestId(request), local ? request.getRemoteAddr() : request.getHeader(VIEWER_IP));
                try {
                    chain.doFilter(request, response);
                } finally {
                    AccessLog.end();
                }
            }
        });
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 1); // straight after OriginCheck
        return reg;
    }

    /** API Gateway's request ID, as its own access log records it; locally a new one. */
    static String requestId(HttpServletRequest request) {
        if (request.getAttribute(RequestReader.API_GATEWAY_CONTEXT_PROPERTY) instanceof AwsProxyRequestContext c
                && c.getRequestId() != null) {
            return c.getRequestId();
        }
        return "local-" + UUID.randomUUID();
    }

    /** On AWS: the access-log group, written by this function's own stream. */
    @Bean
    @Profile("!local")
    AccessLog.Sink cloudWatchAccessLog(@Value("${bladebook.access-log-group}") String group,
                                       @Value("${AWS_LAMBDA_FUNCTION_NAME:api-client}") String function, Clock clock) {
        CloudWatchAccessLog sink = CloudWatchAccessLog.aws(group, function);
        AccessLog.install(sink, clock);
        return sink;
    }

    /** Every response body waits for the request's lines to be written; an error answer replaces it if they aren't. */
    @ControllerAdvice
    static class FlushBeforeBody implements ResponseBodyAdvice<Object> {

        @Override
        public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
            return true;
        }

        @Override
        public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
                                      Class<? extends HttpMessageConverter<?>> converterType, ServerHttpRequest request,
                                      ServerHttpResponse response) {
            AccessLog.flush();
            return body;
        }
    }
}
