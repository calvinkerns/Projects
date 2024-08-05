#lang racket
#|Homemade racket interpreter that utilizes "evaluate" to interpret all racket language using an environment to evaluate
symbols of any kind|#
(provide lookup evaluate special-form? evaluate-special-form main)

#|This makes our closure given variables body and environment|#
(define (closure vars body env)
  (mcons 'closure (mcons env (mcons vars body))))
(define (set-closure-env! clos new-env) 
  (set-mcar! (mcdr clos) new-env))

#|Checks to see if argument is a closure so we know whether to apply with racket or our own apply|#
(define (closure? clos) 
  (and (mpair? clos) (eq? (mcar clos) 'closure)))

#|these get us our pieces of the closure to work with|#
(define (closure-env clos) (mcar (mcdr clos)))
(define (closure-vars clos) (mcar (mcdr (mcdr clos))))
(define (closure-body clos) (mcdr (mcdr (mcdr clos))))

#|When we decide we are dealing with our own special closure format, we evaluate it given a closure and list of values
we first append new vars and their values to the env and then evaluate|#
(define (apply-closure clos lst)
  (evaluate (closure-body clos) 
            (append (map list (closure-vars clos) lst) (closure-env clos))))

#|Will take in two arguments, the first being the function and the second being its arguments. Whether or not that first
arg is a procedure or not will dictate how we apply the function|#
(define (apply-function func args)
  (cond
    [(procedure? func) (apply func args)]
    [(closure? func) (apply-closure func args)]
    [else (error "invalid function")]))

#|This returns true if the list givin as an argument starts with cond or if|#
(define (special-form? lt)
  (and (list? lt)
       (member (car lt) '(if cond let lambda letrec))))

#|This is a recursive method to assist evaluate-special-form in finding the expression to execute when
going through a list beigining with cond|#
(define (helpcond lt env)
  (cond
    [(null? lt) (error "No matching condition in cond")]
    [(equal? #t (evaluate (caar lt) env)) (evaluate (cadar lt) env)]
    [else (helpcond (cdr lt) env)]))

#|This method goes through a "let" list and creates a list that maps all the variables to their according values.
It evaluates each value before assinging it the variable|#
(define (helplet lst env1)
  (map (lambda (binding)
         (list (car binding) (evaluate (cadr binding) env1)))
       lst))

#|This helper method looks through mini environment and when it finds a closure, it sets it to new environment|#

(define (helpletrec MiniEnv NewEnv)
  (for-each
   (lambda (binding)
     (when (closure? (cadr binding))
       (set-closure-env! (cadr binding) NewEnv)))
   MiniEnv))

#|This evaluates special form arguments using a given enviornment by using the recursive helpme method for "cond". For "if"
evaluates the first expression and returns the corresponding element in the list. For "let" it utilizes the recursive helplet function|#
(define (evaluate-special-form lt env)
  (case (car lt)
    [(if) (if (evaluate (cadr lt) env)
              (evaluate (caddr lt) env)
              (evaluate (cadddr lt) env))]
    [(cond) (helpcond (cdr lt) env)]
    [(let) (evaluate (caddr lt) (append (helplet (cadr lt) env) env))]
    [(lambda) (closure (cadr lt) (caddr lt) env)]
    [(letrec) 
     (let* ([MiniEnv (helplet (cadr lt) env)]
            [NewEnv (append MiniEnv env)])
       (helpletrec MiniEnv NewEnv)
       (evaluate (caddr lt) NewEnv))]
    [else (error "Unknown special form")]))

#|lookup takes a symbol and an enviornment as arguments and recursively iterates though
the environment to find the value associated with the key value (symbol). If argument is not a symbol
or the symbol isn't found it throws an error.|#
(define (lookup symb env)
  (cond
    [(not (symbol? symb)) (error "first arg not symbol")]
    [(null? env) (error (format "symbol ~a not found in env" symb))]
    [(equal? (caar env) symb) (cdar env)]
    [else (lookup symb (cdr env))]))

#|evaluate takes an expression as a list and an environment as arguments and iterates through the
expression using map and applying evaluate to each element, using a recursive call when ecountering
a list. If the first element of any list, including the given, is not a procedure then it throws an error.|#
(define (evaluate expression env)
  (cond
    [(symbol? expression) (lookup expression env)]
    [(or (number? expression) (boolean? expression) (string? expression)) expression]
    [(special-form? expression) (evaluate-special-form expression env)]
    [(list? expression) 
     (let ([evaluated-list (map (lambda (exp) (evaluate exp env)) expression)])
       (apply-function (car evaluated-list) (cdr evaluated-list)))]
    [else (error "Unknown expression type")]))

#|initialize enviorment to use|#
(define initial-env
  `((+ . ,+) (- . ,-) (* . ,*) (/ . ,/) (= . ,=) (< . ,<) (> . ,>)
    (<= . ,<=) (>= . ,>=) (car . ,car) (cdr . ,cdr) (cons . ,cons)
    (list . ,list) (null? . ,null?) (number? . ,number?) (symbol? . ,symbol?)
    (pair? . ,pair?) (eq? . ,eq?) (equal? . ,equal?) (length . ,length)
    (append . ,append) (map . ,map) (apply . ,apply) (display . ,display)
    (newline . ,newline) (pi . 3.14159) (e . 2.71828) (true . #t)
    (false . #f) (not . ,not)))

; Function to check if an item is a valid environment
(define (valid-env? env)
  (and (list? env) ; Check if env is a list
       (andmap pair? env) ; Check if every element is a pair
       (andmap (lambda (pair)
                 (and (symbol? (car pair)) ; Check if key is a symbol
                      (or (procedure? (cdr pair)) ; Check if value is a procedure
                          (number? (cdr pair)) ; Check if value is a number
                          (boolean? (cdr pair)) ; Check if value is a boolean
                          (list? (cdr pair))))) ; Check if value is a list
               env)))

#|loop to get user input to pass to evaluate|#
(define (read-eval-print-loop)
  (displayln "Welcome to the Homemade Racket Interpreter!")
  (display "Enter an environment to use or enter N to use default environment: ")
  (let ([input (read-line)]) 
      (cond
        [(not (string=? input "N")) (cond
                                      [(valid-env? input) (set! initial-env input)]
                                      [else (displayln "Invalid environment, using default environment.")]
                                      )]
        )
    )
  (newline)
  (cond
    [
  (let loop ()
    (display "> ")
    (let ([input (read-line)])
      (unless (member input '("exit" "quit"))
        (with-handlers ([exn:fail? (lambda (ex) (displayln (exn-message ex)))])
          (let ([result (evaluate (read (open-input-string input)) initial-env)])
            (writeln result)))
        (loop))))]))
  

#|main is just calling read-eval-print-loop|#
(define (main)
  (read-eval-print-loop))

(main)